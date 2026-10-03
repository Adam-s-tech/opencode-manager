import { describe, it, expect } from 'vitest'
import { act } from '@testing-library/react'
import { renderHookWithRouterAndLocation } from '@/test/test-utils'
import { useOpenTerminal } from './useOpenTerminal'

describe('useOpenTerminal', () => {
  it('opens the terminal dialog with the terminal id', () => {
    const { result, capturedSearch } = renderHookWithRouterAndLocation(
      () => useOpenTerminal(),
      ['/repos/1'],
    )

    act(() => {
      result.current('pty-1')
    })

    const params = new URLSearchParams(capturedSearch.current)
    expect(params.get('dialog')).toBe('terminal')
    expect(params.get('terminal')).toBe('pty-1')
  })

  it('merges extra params and clears mobileTab in the same navigation', () => {
    const { result, capturedSearch } = renderHookWithRouterAndLocation(
      () => useOpenTerminal(),
      ['/repos/1?mobileTab=more'],
    )

    act(() => {
      result.current('pty-2', { repoTab: 'workspaces' })
    })

    const params = new URLSearchParams(capturedSearch.current)
    expect(params.get('dialog')).toBe('terminal')
    expect(params.get('terminal')).toBe('pty-2')
    expect(params.get('repoTab')).toBe('workspaces')
    expect(params.has('mobileTab')).toBe(false)
  })
})
