import { describe, it, expect, beforeEach } from 'vitest'
import { Database } from 'bun:sqlite'
import { migrate } from '../../../src/db/migration-runner'
import { allMigrations } from '../../../src/db/migrations'
import { SettingsService } from '../../../src/services/settings'
import { createRepo, setRepoGitIdentityId } from '../../../src/db/queries'
import { createInternalGitCredentialsRoutes } from '../../../src/routes/internal/git-credentials'
import type { GitCredential } from '@opencode-manager/shared'

describe('internal git-credentials routes', () => {
  let db: Database
  let settingsService: SettingsService
  let app: ReturnType<typeof createInternalGitCredentialsRoutes>

  beforeEach(() => {
    db = new Database(':memory:')
    migrate(db, allMigrations)
    settingsService = new SettingsService(db)
    app = createInternalGitCredentialsRoutes(db)
  })

  it('GET /gh-env returns GH_TOKEN and GITHUB_TOKEN for a GitHub PAT', async () => {
    settingsService.updateSettings({
      gitCredentials: [
        { name: 'github', host: 'github.com', type: 'pat', token: 'ghp_test_token' } as GitCredential,
      ],
    })

    const res = await app.request('/gh-env')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ GH_TOKEN: 'ghp_test_token', GITHUB_TOKEN: 'ghp_test_token' })
  })

  it('GET /gh-env returns an empty object when no GitHub credential exists', async () => {
    const res = await app.request('/gh-env')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})
  })

  it('GET /gh-env includes the assigned identity env for a repo cwd', async () => {
    settingsService.updateSettings({
      gitCredentials: [
        { name: 'github', host: 'github.com', type: 'pat', token: 'ghp_test_token' } as GitCredential,
      ],
      gitIdentities: [{ id: 'identity-1', name: 'Alice', email: 'alice@example.com' }],
    })
    const repo = createRepo(db, {
      repoUrl: 'https://github.com/acme/repo.git',
      localPath: 'repo',
      defaultBranch: 'main',
      cloneStatus: 'ready',
      clonedAt: Date.now(),
    })
    setRepoGitIdentityId(db, repo.id, 'identity-1')

    const res = await app.request(`/gh-env?cwd=${encodeURIComponent(repo.fullPath)}`)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      GH_TOKEN: 'ghp_test_token',
      GITHUB_TOKEN: 'ghp_test_token',
      GIT_AUTHOR_NAME: 'Alice',
      GIT_AUTHOR_EMAIL: 'alice@example.com',
      GIT_COMMITTER_NAME: 'Alice',
      GIT_COMMITTER_EMAIL: 'alice@example.com',
    })
  })

  it('GET /gh-env omits the identity env without an assignment', async () => {
    settingsService.updateSettings({
      gitCredentials: [
        { name: 'github', host: 'github.com', type: 'pat', token: 'ghp_test_token' } as GitCredential,
      ],
      gitIdentities: [{ id: 'identity-1', name: 'Alice', email: 'alice@example.com' }],
    })
    const repo = createRepo(db, {
      repoUrl: 'https://github.com/acme/repo.git',
      localPath: 'repo',
      defaultBranch: 'main',
      cloneStatus: 'ready',
      clonedAt: Date.now(),
    })

    const res = await app.request(`/gh-env?cwd=${encodeURIComponent(repo.fullPath)}`)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ GH_TOKEN: 'ghp_test_token', GITHUB_TOKEN: 'ghp_test_token' })
  })
})
