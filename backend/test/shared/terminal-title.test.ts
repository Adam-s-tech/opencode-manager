import { describe, expect, it } from 'vitest'
import { formatTerminalTitle, isRunningActionTerminal, parseTerminalTitle } from '@opencode-manager/shared/utils'

describe('terminal-title', () => {
  describe('formatTerminalTitle', () => {
    it('encodes a plain shell title as the name', () => {
      expect(formatTerminalTitle({ kind: 'shell', name: 'Terminal' })).toBe('Terminal')
    })

    it('encodes a setup title with the setup prefix', () => {
      expect(formatTerminalTitle({ kind: 'setup', name: 'Worktree setup' })).toBe('ocm:setup:Worktree setup')
    })

    it('encodes an action title with the action id', () => {
      expect(formatTerminalTitle({ kind: 'action', name: 'Dev server', actionId: 'dev' })).toBe('ocm:action:dev:Dev server')
    })

    it('rejects an action without a valid action id', () => {
      expect(() => formatTerminalTitle({ kind: 'action', name: 'Dev server' })).toThrow()
      expect(() => formatTerminalTitle({ kind: 'action', name: 'Dev server', actionId: 'bad id' })).toThrow()
    })
  })

  describe('parseTerminalTitle', () => {
    it('round-trips a shell title', () => {
      expect(parseTerminalTitle(formatTerminalTitle({ kind: 'shell', name: 'My shell' }))).toEqual({
        kind: 'shell',
        title: 'My shell',
      })
    })

    it('round-trips a setup title', () => {
      expect(parseTerminalTitle(formatTerminalTitle({ kind: 'setup', name: 'Worktree setup' }))).toEqual({
        kind: 'setup',
        title: 'Worktree setup',
      })
    })

    it('round-trips an action title including a colon in the name', () => {
      expect(parseTerminalTitle(formatTerminalTitle({ kind: 'action', name: 'Dev: server', actionId: 'dev_1' }))).toEqual({
        kind: 'action',
        title: 'Dev: server',
        actionId: 'dev_1',
      })
    })

    it('treats an untagged title as a shell', () => {
      expect(parseTerminalTitle('plain title')).toEqual({ kind: 'shell', title: 'plain title' })
    })

    it('treats a malformed action id as a shell', () => {
      expect(parseTerminalTitle('ocm:action:bad id:Dev server')).toEqual({
        kind: 'shell',
        title: 'ocm:action:bad id:Dev server',
      })
    })

    it('treats an action prefix without a name as a shell', () => {
      expect(parseTerminalTitle('ocm:action:dev')).toEqual({ kind: 'shell', title: 'ocm:action:dev' })
    })
  })

  describe('isRunningActionTerminal', () => {
    it('matches a running action terminal for the action id', () => {
      expect(isRunningActionTerminal({ kind: 'action', actionId: 'dev', status: 'running' }, 'dev')).toBe(true)
    })

    it('rejects a terminal for a different action id', () => {
      expect(isRunningActionTerminal({ kind: 'action', actionId: 'other', status: 'running' }, 'dev')).toBe(false)
    })

    it('rejects a non-action terminal', () => {
      expect(isRunningActionTerminal({ kind: 'shell', status: 'running' }, 'dev')).toBe(false)
    })

    it('rejects an exited action terminal', () => {
      expect(isRunningActionTerminal({ kind: 'action', actionId: 'dev', status: 'exited' }, 'dev')).toBe(false)
    })
  })
})
