import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenCodeLifecycleStatus } from '@opencode-manager/shared/opencode'
import { renderHookWithRouter } from '@/test/test-utils'
import { OPENCODE_FAILURE_TOAST_ID, useOpenCodeFailureToast } from './useOpenCodeFailureToast'
import { useServerHealth, type HealthResponse } from './useServerHealth'

const mocks = vi.hoisted(() => ({
  showToast: {
    error: vi.fn(),
    success: vi.fn(),
    dismiss: vi.fn(),
  },
}))

vi.mock('@/lib/toast', () => ({
  showToast: mocks.showToast,
}))

vi.mock('./useServerHealth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./useServerHealth')>()),
  useServerHealth: vi.fn(),
}))

function lifecycle(overrides: Partial<OpenCodeLifecycleStatus>): OpenCodeLifecycleStatus {
  return {
    state: 'healthy',
    healthy: true,
    port: 5551,
    version: '2.0.15',
    minVersion: '2.0.15',
    versionSupported: true,
    lastError: null,
    activeRecoveryAction: null,
    attemptedRecoveryActions: [],
    nextRecoveryAction: null,
    failureCount: 0,
    watching: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function mockHealth(opencodeLifecycle: OpenCodeLifecycleStatus) {
  const health: Partial<HealthResponse> = {
    opencode: opencodeLifecycle.healthy ? 'healthy' : 'unhealthy',
    status: opencodeLifecycle.healthy ? 'healthy' : 'unhealthy',
    opencodeLifecycle,
  }
  vi.mocked(useServerHealth).mockReturnValue({ data: health } as ReturnType<typeof useServerHealth>)
}

describe('useOpenCodeFailureToast', () => {
  const onRestart = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('raises one persistent toast per distinct failure, including when the app loads already failed', () => {
    mockHealth(lifecycle({ state: 'failed', healthy: false, lastError: 'OpenCode server exited with code 1' }))
    const { rerender } = renderHookWithRouter(() => useOpenCodeFailureToast(true, onRestart))

    expect(mocks.showToast.error).toHaveBeenCalledTimes(1)
    expect(mocks.showToast.error).toHaveBeenCalledWith('OpenCode server failed', expect.objectContaining({
      id: OPENCODE_FAILURE_TOAST_ID,
      duration: Infinity,
      description: 'OpenCode server exited with code 1',
      action: expect.objectContaining({ label: 'View logs' }),
      cancel: { label: 'Restart', onClick: onRestart },
    }))

    rerender()
    expect(mocks.showToast.error).toHaveBeenCalledTimes(1)

    mockHealth(lifecycle({ state: 'failed', healthy: false, lastError: 'Unsupported OpenCode version' }))
    rerender()
    expect(mocks.showToast.error).toHaveBeenCalledTimes(2)
  })

  it('does not toast while recovery is still in progress', () => {
    mockHealth(lifecycle({ state: 'recovering', healthy: false, lastError: 'health check failed' }))
    renderHookWithRouter(() => useOpenCodeFailureToast(true, onRestart))

    expect(mocks.showToast.error).not.toHaveBeenCalled()
  })

  it('dismisses the failure and announces recovery only once the server is healthy again', () => {
    mockHealth(lifecycle({ state: 'failed', healthy: false, lastError: 'boom' }))
    const { rerender } = renderHookWithRouter(() => useOpenCodeFailureToast(true, onRestart))

    mockHealth(lifecycle({ state: 'starting', healthy: false }))
    rerender()
    expect(mocks.showToast.success).not.toHaveBeenCalled()

    mockHealth(lifecycle({ state: 'healthy', healthy: true }))
    rerender()
    expect(mocks.showToast.dismiss).toHaveBeenCalledWith(OPENCODE_FAILURE_TOAST_ID)
    expect(mocks.showToast.success).toHaveBeenCalledWith('OpenCode server is back online')
  })
})
