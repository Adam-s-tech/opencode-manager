import { describe, it, expect } from 'vitest'
import { act } from '@testing-library/react'
import { renderHookWithRouterAndLocation } from '@/test/test-utils'
import { useOpenTerminal, useTerminalDialogParam } from './useOpenTerminal'

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

describe('useTerminalDialogParam', () => {
  it('drops the selected terminal when the dialog closes so a later open is not tied to it', () => {
    const { result, capturedSearch } = renderHookWithRouterAndLocation(
      () => useTerminalDialogParam(),
      ['/repos/1?dialog=terminal&terminal=pty-1&keep=1'],
    )
    expect(result.current[0]).toBe(true)

    act(() => {
      result.current[1](false)
    })

    const params = new URLSearchParams(capturedSearch.current)
    expect(result.current[0]).toBe(false)
    expect(params.has('dialog')).toBe(false)
    expect(params.has('terminal')).toBe(false)
    expect(params.get('keep')).toBe('1')
  })

  it('leaves another dialog and its params alone', () => {
    const { result, capturedSearch } = renderHookWithRouterAndLocation(
      () => useTerminalDialogParam(),
      ['/repos/1?dialog=preview&terminal=pty-1'],
    )

    act(() => {
      result.current[1](false)
    })

    const params = new URLSearchParams(capturedSearch.current)
    expect(params.get('dialog')).toBe('preview')
    expect(params.get('terminal')).toBe('pty-1')
  })
})
