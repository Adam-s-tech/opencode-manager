import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSidebarCollapsed, useSidebarSections } from './useSidebarCollapsed'

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}

describe('sidebar collapse hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(global, 'localStorage', {
      value: window.localStorage,
      writable: true,
    })
    vi.restoreAllMocks()
  })

  describe('useSidebarCollapsed', () => {
    it('returns false by default when no stored value', () => {
      localStorageMock.getItem.mockReturnValue(null)

      const { result } = renderHook(() => useSidebarCollapsed())

      expect(result.current[0]).toBe(false)
    })

    it('returns stored value from localStorage', () => {
      localStorageMock.getItem.mockReturnValue('true')

      const { result } = renderHook(() => useSidebarCollapsed())

      expect(result.current[0]).toBe(true)
    })

    it('toggles collapsed state and persists to localStorage', () => {
      localStorageMock.getItem.mockReturnValue(null)

      const { result } = renderHook(() => useSidebarCollapsed())

      expect(result.current[0]).toBe(false)

      act(() => {
        result.current[1]()
      })

      expect(result.current[0]).toBe(true)
      expect(localStorageMock.setItem).toHaveBeenCalledWith('oc:sidebar:collapsed', 'true')
    })

    it('returns false when stored value is malformed JSON', () => {
      localStorageMock.getItem.mockReturnValue('not-json{{')

      const { result } = renderHook(() => useSidebarCollapsed())

      expect(result.current[0]).toBe(false)
    })

    it('returns false when stored value is JSON but not a boolean', () => {
      localStorageMock.getItem.mockReturnValue('"some string"')

      const { result } = renderHook(() => useSidebarCollapsed())

      expect(result.current[0]).toBe(false)
    })
  })

  describe('useSidebarSections', () => {
    const sections = ['sessions', 'menu'] as const

    it('opens the default section when no stored value', () => {
      localStorageMock.getItem.mockReturnValue(null)

      const { result } = renderHook(() => useSidebarSections(sections, 'sessions'))

      expect(result.current.openSection).toBe('sessions')
    })

    it('restores the stored open section', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify('menu'))

      const { result } = renderHook(() => useSidebarSections(sections, 'sessions'))

      expect(localStorageMock.getItem).toHaveBeenCalledWith('oc:sidebar:collapsed:section')
      expect(result.current.openSection).toBe('menu')
    })

    it('falls back to the default when the stored section is unknown', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify('other'))

      const { result } = renderHook(() => useSidebarSections(sections, 'sessions'))

      expect(result.current.openSection).toBe('sessions')
    })

    it('opens a section and persists it, closing the other', () => {
      localStorageMock.getItem.mockReturnValue(null)

      const { result } = renderHook(() => useSidebarSections(sections, 'sessions'))

      act(() => {
        result.current.toggleSection('menu')
      })

      expect(result.current.openSection).toBe('menu')
      expect(localStorageMock.setItem).toHaveBeenCalledWith('oc:sidebar:collapsed:section', JSON.stringify('menu'))
    })

    it('closes the open section when toggled again', () => {
      localStorageMock.getItem.mockReturnValue(null)

      const { result } = renderHook(() => useSidebarSections(sections, 'sessions'))

      act(() => {
        result.current.toggleSection('sessions')
      })

      expect(result.current.openSection).toBeNull()
      expect(localStorageMock.setItem).toHaveBeenCalledWith('oc:sidebar:collapsed:section', JSON.stringify(null))
    })
  })
})
