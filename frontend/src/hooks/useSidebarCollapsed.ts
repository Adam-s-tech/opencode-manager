import { useState, useCallback } from 'react'

const STORAGE_KEY = 'oc:sidebar:collapsed'
const CLOSED_SECTIONS_STORAGE_KEY = `${STORAGE_KEY}:closed-sections`

function readStoredBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') {
    return fallback
  }
  const stored = localStorage.getItem(key)
  if (stored === null) {
    return fallback
  }
  try {
    const parsed = JSON.parse(stored)
    return typeof parsed === 'boolean' ? parsed : fallback
  } catch {
    return fallback
  }
}

function usePersistentBoolean(key: string, fallback: boolean): [boolean, () => void] {
  const [value, setValue] = useState(() => readStoredBoolean(key, fallback))

  const toggle = useCallback(() => {
    setValue((prev: boolean) => {
      const newValue = !prev
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(newValue))
      }
      return newValue
    })
  }, [key])

  return [value, toggle]
}

function readStoredClosedSections<T extends string>(sections: readonly T[]): T[] {
  if (typeof window === 'undefined') {
    return []
  }
  const stored = localStorage.getItem(CLOSED_SECTIONS_STORAGE_KEY)
  if (stored === null) {
    return []
  }
  try {
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) {
      return []
    }
    const known = new Set<string>(sections)
    return parsed.filter((value): value is T => typeof value === 'string' && known.has(value))
  } catch {
    return []
  }
}

export function useSidebarCollapsed(): [boolean, () => void] {
  return usePersistentBoolean(STORAGE_KEY, false)
}

export function useSidebarSections<T extends string>(
  sections: readonly T[],
): { isSectionOpen: (section: T) => boolean; toggleSection: (section: T) => void } {
  const [closedSections, setClosedSections] = useState<T[]>(() => readStoredClosedSections(sections))

  const toggleSection = useCallback((section: T) => {
    setClosedSections((prev) => {
      const next = prev.includes(section)
        ? prev.filter((item) => item !== section)
        : [...prev, section]
      if (typeof window !== 'undefined') {
        localStorage.setItem(CLOSED_SECTIONS_STORAGE_KEY, JSON.stringify(next))
      }
      return next
    })
  }, [])

  const isSectionOpen = useCallback(
    (section: T) => !closedSections.includes(section),
    [closedSections],
  )

  return { isSectionOpen, toggleSection }
}
