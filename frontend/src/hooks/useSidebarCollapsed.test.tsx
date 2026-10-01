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

    it('opens every section by default when no stored value', () => {
      localStorageMock.getItem.mockReturnValue(null)

      const { result } = renderHook(() => useSidebarSections(sections))

      expect(result.current.isSectionOpen('sessions')).toBe(true)
      expect(result.current.isSectionOpen('menu')).toBe(true)
    })

    it('restores closed sections from storage', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify(['sessions']))

      const { result } = renderHook(() => useSidebarSections(sections))

      expect(localStorageMock.getItem).toHaveBeenCalledWith('oc:sidebar:collapsed:closed-sections')
      expect(result.current.isSectionOpen('sessions')).toBe(false)
      expect(result.current.isSectionOpen('menu')).toBe(true)
    })

    it('ignores unknown sections from storage', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify(['sessions', 'other']))

      const { result } = renderHook(() => useSidebarSections(sections))

      expect(result.current.isSectionOpen('sessions')).toBe(false)
      expect(result.current.isSectionOpen('menu')).toBe(true)
    })

    it('opens every section when the stored value is malformed JSON', () => {
      localStorageMock.getItem.mockReturnValue('not-json{{')

      const { result } = renderHook(() => useSidebarSections(sections))

      expect(result.current.isSectionOpen('sessions')).toBe(true)
      expect(result.current.isSectionOpen('menu')).toBe(true)
    })

    it('opens every section when the stored value is not an array', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify('menu'))

      const { result } = renderHook(() => useSidebarSections(sections))

      expect(result.current.isSectionOpen('sessions')).toBe(true)
      expect(result.current.isSectionOpen('menu')).toBe(true)
    })

    it('closes a section and persists it without affecting the others', () => {
      localStorageMock.getItem.mockReturnValue(null)

      const { result } = renderHook(() => useSidebarSections(sections))

      act(() => {
        result.current.toggleSection('sessions')
      })

      expect(result.current.isSectionOpen('sessions')).toBe(false)
      expect(result.current.isSectionOpen('menu')).toBe(true)
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'oc:sidebar:collapsed:closed-sections',
        JSON.stringify(['sessions']),
      )
    })

    it('reopens a closed section when toggled again', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify(['sessions']))

      const { result } = renderHook(() => useSidebarSections(sections))

      act(() => {
        result.current.toggleSection('sessions')
      })

      expect(result.current.isSectionOpen('sessions')).toBe(true)
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'oc:sidebar:collapsed:closed-sections',
        JSON.stringify([]),
      )
    })

    it('tracks each section independently', () => {
      localStorageMock.getItem.mockReturnValue(null)

      const { result } = renderHook(() => useSidebarSections(sections))

      act(() => {
        result.current.toggleSection('sessions')
        result.current.toggleSection('menu')
      })

      expect(result.current.isSectionOpen('sessions')).toBe(false)
      expect(result.current.isSectionOpen('menu')).toBe(false)
    })
  })
})
