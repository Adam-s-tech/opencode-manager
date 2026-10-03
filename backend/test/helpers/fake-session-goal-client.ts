import type { OpenCodeClient } from '../../src/services/opencode/client'

export interface FakeSessionGoalTokens {
  input: number
  output: number
  reasoning: number
}

export interface FakeSessionGoalClientOptions {
  tokens?: Record<string, FakeSessionGoalTokens>
  failSessionGet?: boolean
}

export function createFakeSessionGoalClient(options: FakeSessionGoalClientOptions = {}): OpenCodeClient {
  const tokens = options.tokens ?? {}

  return {
    api: {
      session: {
        get: async ({ sessionID }: { sessionID: string }) => {
          if (options.failSessionGet) {
            throw new Error('upstream unavailable')
          }
          const usage = tokens[sessionID] ?? { input: 0, output: 0, reasoning: 0 }
          return {
            tokens: {
              input: usage.input,
              output: usage.output,
              reasoning: usage.reasoning,
              cache: { read: 0, write: 0 },
            },
          }
        },
      },
    },
    forwardRaw: async () => new Response(),
  } as unknown as OpenCodeClient
}
