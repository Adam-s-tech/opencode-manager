import { assistantText, type SessionMessageAssistant, type SessionMessageInfo } from '@opencode-manager/shared/opencode'
import type { OpenCodeClient } from './opencode/client'

export interface AssistantReplyState {
  responseText: string | null
  errorText: string | null
  completed: boolean
}

export function getLatestAssistantReplyState(messages: SessionMessageInfo[]): AssistantReplyState | null {
  const assistantMessage = messages.find(
    (message): message is SessionMessageAssistant => message.type === 'assistant',
  )

  if (!assistantMessage) {
    return null
  }

  return {
    responseText: assistantText(assistantMessage.content, { stripThink: true }) || null,
    errorText: assistantMessage.error?.message ?? null,
    completed: Boolean(assistantMessage.time.completed),
  }
}

export async function readLatestAssistantReply(client: OpenCodeClient, sessionId: string): Promise<AssistantReplyState | null> {
  const response = await client.api.message.list({
    sessionID: sessionId,
    order: 'desc',
    limit: 20,
  })
  return getLatestAssistantReplyState(response.data)
}

export async function isSessionBusy(client: OpenCodeClient, sessionId: string): Promise<boolean> {
  const active = await client.api.session.active()
  return sessionId in active
}
