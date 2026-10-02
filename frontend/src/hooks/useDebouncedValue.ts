import { useEffect, useState } from 'react'

/** Returns `value` once it has stopped changing for `delayMs` milliseconds. */
export function useDebouncedValue<T>(value: T, delayMs: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debouncedValue
}
