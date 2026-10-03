import type { TerminalKind } from '../schemas/terminal'

const ACTION_TITLE_PREFIX = 'ocm:action:'
const SETUP_TITLE_PREFIX = 'ocm:setup:'
const ACTION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

export interface FormatTerminalTitleInput {
  kind: TerminalKind
  name: string
  actionId?: string
}

export interface ParsedTerminalTitle {
  kind: TerminalKind
  title: string
  actionId?: string
}

export function formatTerminalTitle(input: FormatTerminalTitleInput): string {
  if (input.kind === 'action') {
    if (!input.actionId || !ACTION_ID_PATTERN.test(input.actionId)) {
      throw new Error('Action terminals require a valid action id')
    }
    return `${ACTION_TITLE_PREFIX}${input.actionId}:${input.name}`
  }

  if (input.kind === 'setup') {
    return `${SETUP_TITLE_PREFIX}${input.name}`
  }

  return input.name
}

export function parseTerminalTitle(raw: string): ParsedTerminalTitle {
  if (raw.startsWith(ACTION_TITLE_PREFIX)) {
    const rest = raw.slice(ACTION_TITLE_PREFIX.length)
    const separator = rest.indexOf(':')
    const actionId = separator === -1 ? rest : rest.slice(0, separator)
    const title = separator === -1 ? '' : rest.slice(separator + 1)

    if (ACTION_ID_PATTERN.test(actionId) && title.length > 0) {
      return { kind: 'action', title, actionId }
    }

    return { kind: 'shell', title: raw }
  }

  if (raw.startsWith(SETUP_TITLE_PREFIX)) {
    return { kind: 'setup', title: raw.slice(SETUP_TITLE_PREFIX.length) }
  }

  return { kind: 'shell', title: raw }
}
