import { useState, useCallback } from 'react'

const STORAGE_KEY = 'oc:sidebar:collapsed'
const SECTION_STORAGE_KEY = `${STORAGE_KEY}:section`

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

function readStoredSection<T extends string>(sections: readonly T[], fallback: T | null): T | null {
  if (typeof window === 'undefined') {
    return fallback
  }
  const stored = localStorage.getItem(SECTION_STORAGE_KEY)
  if (stored === null) {
    return fallback
  }
  try {
    const parsed = JSON.parse(stored)
    return typeof parsed === 'string' && (sections as readonly string[]).includes(parsed)
      ? (parsed as T)
      : fallback
  } catch {
    return fallback
  }
}

export function useSidebarCollapsed(): [boolean, () => void] {
  return usePersistentBoolean(STORAGE_KEY, false)
}

export function useSidebarSections<T extends string>(
  sections: readonly T[],
  defaultSection: T | null = null,
): { openSection: T | null; toggleSection: (section: T) => void } {
  const [openSection, setOpenSection] = useState<T | null>(() => readStoredSection(sections, defaultSection))

  const toggleSection = useCallback((section: T) => {
    setOpenSection((prev) => {
      const next = prev === section ? null : section
      if (typeof window !== 'undefined') {
        localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(next))
      }
      return next
    })
  }, [])

  return { openSection, toggleSection }
}
