import { describe, expect, it, vi } from 'vitest'
import type { SessionMessageInfo } from '@opencode-manager/shared/opencode'
import type { OpenCodeClient } from '../../src/services/opencode/client'
import {
  getLatestAssistantReplyState,
  isSessionBusy,
  readLatestAssistantReply,
} from '../../src/services/session-reply'
import { assistantMessage } from '../helpers/stub-schedule-api'

function createFakeClient(messages: SessionMessageInfo[], active: Record<string, unknown> = {}): OpenCodeClient {
  return {
    api: {
      message: {
        list: vi.fn(async () => ({ data: messages, cursor: {} })),
      },
      session: {
        active: vi.fn(async () => active),
      },
    },
    forwardRaw: vi.fn(),
  } as unknown as OpenCodeClient
}

describe('getLatestAssistantReplyState', () => {
  it('returns the newest assistant text with think blocks stripped', () => {
    const state = getLatestAssistantReplyState([
      assistantMessage('', {
        completed: true,
        content: [
          { type: 'text', text: '\u003cthink\u003eprivate reasoning\u003c/think\u003e\nFinal answer' },
          { type: 'text', text: 'Second paragraph.' },
        ],
      }),
    ])

    expect(state).toEqual({
      responseText: 'Final answer\n\nSecond paragraph.',
      errorText: null,
      completed: true,
    })
  })

  it('surfaces the assistant error message', () => {
    const state = getLatestAssistantReplyState([
      assistantMessage('', { error: 'Provider exploded' }),
    ])

    expect(state).toEqual({
      responseText: null,
      errorText: 'Provider exploded',
      completed: false,
    })
  })

  it('reports an incomplete assistant message as not completed', () => {
    const state = getLatestAssistantReplyState([assistantMessage('Partial output')])

    expect(state).toEqual({
      responseText: 'Partial output',
      errorText: null,
      completed: false,
    })
  })

  it('returns null when no assistant message is present', () => {
    expect(getLatestAssistantReplyState([])).toBeNull()
  })
})

describe('readLatestAssistantReply', () => {
  it('reads the newest assistant reply through the client', async () => {
    const client = createFakeClient([assistantMessage('From the client.', { completed: true })])

    await expect(readLatestAssistantReply(client, 'ses-1')).resolves.toEqual({
      responseText: 'From the client.',
      errorText: null,
      completed: true,
    })
    expect(client.api.message.list).toHaveBeenCalledWith({
      sessionID: 'ses-1',
      order: 'desc',
      limit: 20,
    })
  })

  it('returns null when the session has no assistant message', async () => {
    await expect(readLatestAssistantReply(createFakeClient([]), 'ses-1')).resolves.toBeNull()
  })
})

describe('isSessionBusy', () => {
  it('is true when the session appears in the active set', async () => {
    const client = createFakeClient([], { 'ses-1': { type: 'running' } })

    await expect(isSessionBusy(client, 'ses-1')).resolves.toBe(true)
  })

  it('is false when the session is absent from the active set', async () => {
    await expect(isSessionBusy(createFakeClient([], {}), 'ses-1')).resolves.toBe(false)
  })
})
