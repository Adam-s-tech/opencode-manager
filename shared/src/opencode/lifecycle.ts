export const OPENCODE_LIFECYCLE_STATES = [
  'idle',
  'starting',
  'healthy',
  'unhealthy',
  'recovering',
  'failed',
  'stopping',
  'stopped',
] as const

export type OpenCodeLifecycleState = (typeof OPENCODE_LIFECYCLE_STATES)[number]

export const OPENCODE_RECOVERY_ACTIONS = [
  'restart',
  'debug_capture',
  'rollback_last_known_good',
  'seed_default_config',
] as const

export type OpenCodeRecoveryAction = (typeof OPENCODE_RECOVERY_ACTIONS)[number]

export interface OpenCodeLifecycleStatus {
  state: OpenCodeLifecycleState
  healthy: boolean
  port: number
  version: string | null
  minVersion: string
  versionSupported: boolean
  lastError: string | null
  activeRecoveryAction: OpenCodeRecoveryAction | null
  attemptedRecoveryActions: OpenCodeRecoveryAction[]
  nextRecoveryAction: OpenCodeRecoveryAction | null
  failureCount: number
  watching: boolean
  updatedAt: string
}
