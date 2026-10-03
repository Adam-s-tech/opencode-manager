import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import type { Database } from 'bun:sqlite'
import type { Repo } from '@opencode-manager/shared/types'
import {
  ProjectActionSchema,
  RepoProjectFileSchema,
  WorktreeSetupCommandsSchema,
  type MoveProjectItemRequest,
  type ProjectAction,
  type ProjectConfigResponse,
  type RepoProjectFile,
  type RunProjectActionResponse,
} from '@opencode-manager/shared/schemas'
import { getRepoByDirectory, getRepoSetting, setRepoSetting } from '../db/queries'
import { executeCommand } from '../utils/process'
import { getErrorMessage } from '../utils/error-utils'
import { canonicalPathSync } from '../utils/fs-safe'
import type { GitService } from './git/GitService'
import type { GitAuthService } from './git-auth'
import type { TerminalService } from './terminal'

const PROJECT_ACTIONS_KEY = 'projectActions'
const WORKTREE_SETUP_KEY = 'worktreeSetupCommands'
const REPO_CONFIG_TRUST_KEY = 'repoConfigTrustHash'
const REPO_FILE_RELATIVE_PATH = path.join('.ocm', 'project.json')

export interface RepoFileState {
  exists: boolean
  file: RepoProjectFile | null
  hash: string | null
  error?: string
}

interface MoveCommit {
  repoFile: RepoProjectFile | null
  personalActions?: ProjectAction[]
  personalSetup?: string[]
  trustHash: string | null
}

interface RepoFileSnapshot {
  exists: boolean
  content: Buffer | null
}

export class ProjectConfigError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'ProjectConfigError'
  }
}

export class ProjectConfigService {
  private readonly actionRunQueues = new Map<string, Promise<void>>()

  constructor(
    private readonly database: Database,
    private readonly git: GitService,
    private readonly gitAuthService: GitAuthService,
  ) {}

  async resolveProjectRepo(repo: Repo): Promise<Repo> {
    if (!repo.isWorktree) {
      return repo
    }
    const mainCheckout = await this.git.getMainCheckoutPath(repo.fullPath)
    return getRepoByDirectory(this.database, mainCheckout) ?? repo
  }

  getPersonalActions(projectRepo: Repo): ProjectAction[] {
    return this.readStoredJson(projectRepo.id, PROJECT_ACTIONS_KEY, z.array(ProjectActionSchema)) ?? []
  }

  setPersonalActions(projectRepo: Repo, actions: ProjectAction[]): void {
    const ids = new Set<string>()
    for (const action of actions) {
      if (ids.has(action.id)) {
        throw new ProjectConfigError(400, 'Duplicate action id')
      }
      ids.add(action.id)
    }
    setRepoSetting(this.database, projectRepo.id, PROJECT_ACTIONS_KEY, JSON.stringify(actions))
  }

  getPersonalSetup(projectRepo: Repo): string[] {
    return this.readStoredJson(projectRepo.id, WORKTREE_SETUP_KEY, WorktreeSetupCommandsSchema) ?? []
  }

  setPersonalSetup(projectRepo: Repo, commands: string[]): void {
    setRepoSetting(this.database, projectRepo.id, WORKTREE_SETUP_KEY, JSON.stringify(commands))
  }

  async getConfig(repo: Repo, directory: string): Promise<ProjectConfigResponse> {
    const projectRepo = await this.resolveProjectRepo(repo)
    const repoFile = this.readRepoFile(directory)
    const warnings: string[] = []

    const actions: ProjectConfigResponse['actions'] = this.getPersonalActions(projectRepo).map((action) => ({
      ...action,
      source: 'personal' as const,
    }))
    const actionIds = new Set(actions.map((action) => action.id))

    for (const action of repoFile.file?.projectActions ?? []) {
      if (actionIds.has(action.id)) {
        warnings.push(`Repository action "${action.id}" was ignored because a personal action uses the same id`)
        continue
      }
      actionIds.add(action.id)
      actions.push({ ...action, source: 'repo' })
    }

    const worktreeSetup: ProjectConfigResponse['worktreeSetup'] = this.getPersonalSetup(projectRepo).map((command) => ({
      command,
      source: 'personal' as const,
    }))
    for (const command of repoFile.file?.setupWorktree ?? []) {
      worktreeSetup.push({ command, source: 'repo' })
    }

    const trusted =
      repoFile.hash !== null &&
      repoFile.hash === getRepoSetting(this.database, projectRepo.id, REPO_CONFIG_TRUST_KEY)

    const resolvedActions = await Promise.all(
      actions.map(async (action) =>
        action.url ? { ...action, resolvedUrl: await this.resolveActionUrl(action.url, directory) } : action,
      ),
    )

    return {
      actions: resolvedActions,
      worktreeSetup,
      repoFile: {
        path: '.ocm/project.json',
        exists: repoFile.exists,
        trusted,
        hash: repoFile.hash,
        ...(repoFile.error ? { error: repoFile.error } : {}),
        warnings,
      },
    }
  }

  async resolveActionUrl(template: string, directory: string): Promise<string> {
    const withWorktree = template.replaceAll('{worktree}', path.basename(directory))
    if (!withWorktree.includes('{branch}')) {
      return withWorktree
    }

    try {
      const branch = (
        await executeCommand(['git', '-C', directory, 'rev-parse', '--abbrev-ref', 'HEAD'], {
          env: this.gitAuthService.getGitEnvironment(),
          silent: true,
        })
      ).trim()
      return withWorktree.replaceAll('{branch}', branch)
    } catch {
      return template
    }
  }

  async runAction(
    repo: Repo,
    directory: string,
    actionId: string,
    terminalService: TerminalService,
  ): Promise<RunProjectActionResponse> {
    const config = await this.getConfig(repo, directory)
    const action = config.actions.find((item) => item.id === actionId)
    if (!action) {
      throw new ProjectConfigError(404, 'Action not found')
    }

    if (action.source === 'repo' && !config.repoFile.trusted) {
      throw new ProjectConfigError(409, 'Repository commands are not trusted', 'REPO_CONFIG_UNTRUSTED', {
        hash: config.repoFile.hash,
      })
    }

    const key = this.actionRunKey(directory, actionId)
    return this.enqueueActionRun(key, async () => {
      const terminals = await terminalService.list(directory)
      const running = terminals.find(
        (terminal) => terminal.kind === 'action' && terminal.actionId === actionId && terminal.status === 'running',
      )
      const terminal =
        running ??
        (await terminalService.create(directory, {
          kind: 'action',
          actionId,
          name: action.name,
          command: '/bin/sh',
          args: ['-c', action.command],
        }))

      return {
        terminal,
        alreadyRunning: running !== undefined,
        ...(action.resolvedUrl ? { resolvedUrl: action.resolvedUrl } : {}),
        autoOpenUrl: action.autoOpenUrl,
      }
    })
  }

  private actionRunKey(directory: string, actionId: string): string {
    const canonical = canonicalPathSync(path.resolve(directory))
    return `${canonical}\u0000${actionId}`
  }

  private enqueueActionRun<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.actionRunQueues.get(key) ?? Promise.resolve()
    const result = previous.then(operation, operation)
    const tail = result.then(
      () => undefined,
      () => undefined,
    )
    this.actionRunQueues.set(key, tail)
    void tail.then(() => {
      if (this.actionRunQueues.get(key) === tail) {
        this.actionRunQueues.delete(key)
      }
    })
    return result
  }

  readRepoFile(directory: string): RepoFileState {
    const filePath = this.getRepoFilePath(directory)
    if (!fs.existsSync(filePath)) {
      return { exists: false, file: null, hash: null }
    }

    try {
      const parsed = RepoProjectFileSchema.safeParse(JSON.parse(fs.readFileSync(filePath, 'utf8')))
      if (!parsed.success) {
        return { exists: true, file: null, hash: null, error: 'Invalid repository config' }
      }
      return { exists: true, file: parsed.data, hash: this.hashRepoFile(parsed.data) }
    } catch (error: unknown) {
      return { exists: true, file: null, hash: null, error: getErrorMessage(error) }
    }
  }

  hashRepoFile(file: RepoProjectFile): string {
    const executable = {
      actions: (file.projectActions ?? []).map(({ id, command, url }) => ({ id, command, url: url ?? null })),
      setup: file.setupWorktree ?? [],
    }
    return createHash('sha256').update(JSON.stringify(executable)).digest('hex')
  }

  async trustRepoFile(repo: Repo, directory: string, hash: string): Promise<void> {
    const projectRepo = await this.resolveProjectRepo(repo)
    const repoFile = this.readRepoFile(directory)
    if (repoFile.hash === null || repoFile.hash !== hash) {
      throw new ProjectConfigError(409, 'Repository config changed', 'REPO_CONFIG_CHANGED')
    }
    this.setRepoTrust(projectRepo, repoFile.hash)
  }

  async moveItem(repo: Repo, directory: string, request: MoveProjectItemRequest): Promise<void> {
    const projectRepo = await this.resolveProjectRepo(repo)
    const filePath = this.getRepoFilePath(directory)
    const state = this.readRepoFile(directory)
    const commit =
      request.to === 'repo'
        ? this.planMoveToRepo(projectRepo, state, request)
        : this.planMoveToPersonal(projectRepo, state, request)

    this.commitMove(projectRepo, filePath, commit)
  }

  private planMoveToRepo(projectRepo: Repo, state: RepoFileState, request: MoveProjectItemRequest): MoveCommit {
    if (state.exists && !state.file) {
      throw new ProjectConfigError(409, 'Repository config is invalid')
    }

    const file: RepoProjectFile = state.file ? { ...state.file } : { version: 1 }

    if (request.kind === 'action') {
      const personal = this.getPersonalActions(projectRepo)
      const action = personal.find((item) => item.id === request.id)
      if (!action) {
        throw new ProjectConfigError(404, 'Action not found')
      }
      const repoActions = file.projectActions ?? []
      if (repoActions.some((existing) => existing.id === action.id)) {
        throw new ProjectConfigError(409, 'Action already exists in repository config')
      }
      const nextFile: RepoProjectFile = { ...file, projectActions: [...repoActions, action] }
      this.assertRepoFileValid(nextFile)
      return {
        repoFile: nextFile,
        personalActions: personal.filter((item) => item.id !== action.id),
        trustHash: this.hashRepoFile(nextFile),
      }
    }

    const personal = this.getPersonalSetup(projectRepo)
    const index = personal.indexOf(request.command)
    if (index === -1) {
      throw new ProjectConfigError(404, 'Setup command not found')
    }
    const nextFile: RepoProjectFile = {
      ...file,
      setupWorktree: [...(file.setupWorktree ?? []), request.command],
    }
    const nextPersonal = personal.filter((_, itemIndex) => itemIndex !== index)
    this.assertRepoFileValid(nextFile)
    this.assertPersonalSetupValid(nextPersonal)
    return { repoFile: nextFile, personalSetup: nextPersonal, trustHash: this.hashRepoFile(nextFile) }
  }

  private planMoveToPersonal(projectRepo: Repo, state: RepoFileState, request: MoveProjectItemRequest): MoveCommit {
    const file = state.file
    if (!file) {
      throw new ProjectConfigError(404, 'Item not found')
    }

    if (request.kind === 'action') {
      const repoActions = file.projectActions ?? []
      const action = repoActions.find((item) => item.id === request.id)
      if (!action) {
        throw new ProjectConfigError(404, 'Action not found')
      }
      const nextFile = this.pruneRepoFile({
        ...file,
        projectActions: repoActions.filter((item) => item.id !== action.id),
      })
      const personalActions = [...this.getPersonalActions(projectRepo), action]
      return nextFile
        ? { repoFile: nextFile, personalActions, trustHash: this.hashRepoFile(nextFile) }
        : { repoFile: null, personalActions, trustHash: null }
    }

    const repoSetup = file.setupWorktree ?? []
    const index = repoSetup.indexOf(request.command)
    if (index === -1) {
      throw new ProjectConfigError(404, 'Setup command not found')
    }
    const nextFile = this.pruneRepoFile({
      ...file,
      setupWorktree: repoSetup.filter((_, itemIndex) => itemIndex !== index),
    })
    const personalSetup = [...this.getPersonalSetup(projectRepo), request.command]
    this.assertPersonalSetupValid(personalSetup)
    return nextFile
      ? { repoFile: nextFile, personalSetup, trustHash: this.hashRepoFile(nextFile) }
      : { repoFile: null, personalSetup, trustHash: null }
  }

  private pruneRepoFile(file: RepoProjectFile): RepoProjectFile | null {
    const next: RepoProjectFile = { ...file }
    if (next.projectActions && next.projectActions.length === 0) {
      delete next.projectActions
    }
    if (next.setupWorktree && next.setupWorktree.length === 0) {
      delete next.setupWorktree
    }
    if (Object.keys(next).every((key) => key === 'version')) {
      return null
    }
    this.assertRepoFileValid(next)
    return next
  }

  private commitMove(projectRepo: Repo, filePath: string, commit: MoveCommit): void {
    const snapshot = this.snapshotFile(filePath)
    let fileMutated = false

    try {
      this.database.transaction(() => {
        if (commit.repoFile === null) {
          fs.rmSync(filePath, { force: true })
        } else {
          this.writeRepoFile(filePath, commit.repoFile)
        }
        fileMutated = true

        if (commit.personalActions !== undefined) {
          this.setPersonalActions(projectRepo, commit.personalActions)
        }
        if (commit.personalSetup !== undefined) {
          this.setPersonalSetup(projectRepo, commit.personalSetup)
        }
        this.setRepoTrust(projectRepo, commit.trustHash)
      })()
    } catch (error) {
      if (fileMutated) {
        this.restoreFile(filePath, snapshot)
      }
      throw error
    }

    if (commit.repoFile === null) {
      this.removeOcmDirIfEmpty(filePath)
    }
  }

  private assertRepoFileValid(file: RepoProjectFile): void {
    const result = RepoProjectFileSchema.safeParse(file)
    if (!result.success) {
      throw new ProjectConfigError(
        409,
        'Repository config limit exceeded',
        'PROJECT_CONFIG_LIMIT_EXCEEDED',
        result.error.flatten(),
      )
    }
  }

  private assertPersonalSetupValid(commands: string[]): void {
    const result = WorktreeSetupCommandsSchema.safeParse(commands)
    if (!result.success) {
      throw new ProjectConfigError(
        409,
        'Personal setup command limit exceeded',
        'PROJECT_CONFIG_LIMIT_EXCEEDED',
        result.error.flatten(),
      )
    }
  }

  private setRepoTrust(projectRepo: Repo, hash: string | null): void {
    setRepoSetting(this.database, projectRepo.id, REPO_CONFIG_TRUST_KEY, hash)
  }

  private getRepoFilePath(directory: string): string {
    return path.join(directory, REPO_FILE_RELATIVE_PATH)
  }

  private writeRepoFile(filePath: string, file: RepoProjectFile): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    const tmpPath = `${filePath}.tmp`
    try {
      fs.writeFileSync(tmpPath, `${JSON.stringify(file, null, 2)}\n`)
      fs.renameSync(tmpPath, filePath)
    } catch (error) {
      fs.rmSync(tmpPath, { force: true })
      throw error
    }
  }

  private snapshotFile(filePath: string): RepoFileSnapshot {
    try {
      return { exists: true, content: fs.readFileSync(filePath) }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { exists: false, content: null }
      }
      throw error
    }
  }

  private restoreFile(filePath: string, snapshot: RepoFileSnapshot): void {
    if (!snapshot.exists || snapshot.content === null) {
      fs.rmSync(filePath, { force: true })
      return
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, snapshot.content)
  }

  private removeOcmDirIfEmpty(filePath: string): void {
    const dir = path.dirname(filePath)
    try {
      if (fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }

  private readStoredJson<T>(repoId: number, key: string, schema: z.ZodType<T>): T | null {
    const raw = getRepoSetting(this.database, repoId, key)
    if (!raw) {
      return null
    }
    try {
      const result = schema.safeParse(JSON.parse(raw))
      return result.success ? result.data : null
    } catch {
      return null
    }
  }
}
