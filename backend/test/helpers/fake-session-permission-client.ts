import type { OpenCodeClient } from '../../src/services/opencode/client'

export interface FakeSessionPermissionClientOptions {
  parents?: Record<string, string | null>
  failSessionGet?: boolean
}

export function createFakeSessionPermissionClient(
  options: FakeSessionPermissionClientOptions = {},
): OpenCodeClient {
  const parents = options.parents ?? {}

  return {
    api: {
      session: {
        get: async ({ sessionID }: { sessionID: string }) => {
          if (options.failSessionGet) {
            throw new Error('upstream unavailable')
          }
          return { parentID: parents[sessionID] ?? undefined }
        },
      },
    },
    forwardRaw: async () => new Response(),
  } as unknown as OpenCodeClient
}
