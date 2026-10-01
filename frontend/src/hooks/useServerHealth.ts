import { useQuery } from '@tanstack/react-query'
import type { OpenCodeLifecycleStatus, OpenCodeRecoveryAction } from '@opencode-manager/shared/opencode'
import { fetchWrapper } from '@/api/fetchWrapper'

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  database: 'connected' | 'disconnected'
  opencode: 'healthy' | 'unhealthy'
  opencodePort: number
  opencodeVersion: string | null
  opencodeMinVersion: string
  opencodeVersionSupported: boolean
  opencodeManagerVersion: string | null
  opencodeRestartPending?: boolean
  opencodeLifecycle?: OpenCodeLifecycleStatus
  sandbox?: { available: boolean; enabled: boolean; enforced: boolean; reason?: string; msbVersion?: string }
  error?: string
}

export interface OpenCodeServerIssue {
  state: 'failed' | 'recovering' | 'unhealthy'
  message: string
  attemptedRecoveryActions: OpenCodeRecoveryAction[]
}

const DEFAULT_ISSUE_MESSAGE = 'OpenCode server is not responding'

async function fetchHealth(): Promise<HealthResponse> {
  return fetchWrapper<HealthResponse>('/api/health', { acceptedStatuses: [503] })
}

/**
 * Derives the current OpenCode server problem from a health payload, preferring
 * the supervisor lifecycle (which distinguishes in-progress recovery from a
 * terminal failure) and falling back to the raw health probe.
 */
export function getOpenCodeServerIssue(health: HealthResponse | undefined): OpenCodeServerIssue | null {
  if (!health) return null
  const lifecycle = health.opencodeLifecycle
  if (lifecycle) {
    if (lifecycle.state !== 'failed' && lifecycle.state !== 'recovering' && lifecycle.state !== 'unhealthy') return null
    return {
      state: lifecycle.state,
      message: lifecycle.lastError ?? health.error ?? DEFAULT_ISSUE_MESSAGE,
      attemptedRecoveryActions: lifecycle.attemptedRecoveryActions,
    }
  }
  if (health.opencode === 'healthy') return null
  return {
    state: health.status === 'unhealthy' ? 'failed' : 'unhealthy',
    message: health.error ?? DEFAULT_ISSUE_MESSAGE,
    attemptedRecoveryActions: [],
  }
}

export function useServerHealth(enabled = true) {
  return useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 30000,
    retry: false,
    enabled,
    staleTime: 10000,
  })
}
