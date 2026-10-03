import { openCodeErrorStatus } from '@opencode-manager/shared/opencode'
import { formatTerminalTitle, parseTerminalTitle } from '@opencode-manager/shared/utils'
import type { TerminalInfo, TerminalKind } from '@opencode-manager/shared/types'
import type { OpenCodeClient } from './opencode/client'
import type { CredentialProvider } from './credential-provider'

type OpenCodePty = Awaited<ReturnType<OpenCodeClient['api']['pty']['list']>>['data'][number]

export interface CreateTerminalInput {
  kind: TerminalKind
  name: string
  actionId?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
}

export interface TerminalSize {
  cols: number
  rows: number
}

export class TerminalNotFoundError extends Error {
  constructor(ptyID: string) {
    super(`Terminal not found: ${ptyID}`)
    this.name = 'TerminalNotFoundError'
  }
}

export class TerminalService {
  constructor(
    private readonly openCodeClient: OpenCodeClient,
    private readonly credentialProvider: CredentialProvider,
  ) {}

  async list(directory: string): Promise<TerminalInfo[]> {
    const result = await this.openCodeClient.api.pty.list({ location: { directory } })
    return result.data.map((pty) => this.toTerminalInfo(pty))
  }

  async create(directory: string, input: CreateTerminalInput): Promise<TerminalInfo> {
    const result = await this.openCodeClient.api.pty.create({
      location: { directory },
      title: formatTerminalTitle({ kind: input.kind, name: input.name, actionId: input.actionId }),
      ...(input.command !== undefined ? { command: input.command } : {}),
      ...(input.args !== undefined ? { args: input.args } : {}),
      env: { ...this.credentialProvider.getShellEnv({ cwd: directory }), ...input.env },
    })
    return this.toTerminalInfo(result.data)
  }

  async requireTerminal(directory: string, ptyID: string): Promise<TerminalInfo> {
    const terminals = await this.list(directory)
    const terminal = terminals.find((entry) => entry.id === ptyID)
    if (!terminal) {
      throw new TerminalNotFoundError(ptyID)
    }
    return terminal
  }

  async resize(directory: string, ptyID: string, size: TerminalSize): Promise<void> {
    await this.openCodeClient.api.pty.update({ ptyID, location: { directory }, size })
  }

  async remove(directory: string, ptyID: string): Promise<void> {
    await this.openCodeClient.api.pty.remove({ ptyID, location: { directory } })
  }

  async removeAll(directory: string): Promise<void> {
    const terminals = await this.list(directory)
    for (const terminal of terminals) {
      try {
        await this.remove(directory, terminal.id)
      } catch (error: unknown) {
        if (openCodeErrorStatus(error) === 404) continue
        throw error
      }
    }
  }

  private toTerminalInfo(pty: OpenCodePty): TerminalInfo {
    const parsed = parseTerminalTitle(pty.title)
    return {
      id: pty.id,
      title: parsed.title,
      kind: parsed.kind,
      ...(parsed.actionId ? { actionId: parsed.actionId } : {}),
      cwd: pty.cwd,
      status: pty.status,
      ...(pty.exitCode !== undefined ? { exitCode: pty.exitCode } : {}),
    }
  }
}
