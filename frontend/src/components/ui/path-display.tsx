import { useMemo } from 'react'
import { shortenPath } from '@/lib/utils'

interface PathDisplayProps {
  path: string
  maxSegments?: number
  className?: string
}

export function PathDisplay({ path, maxSegments = 3, className = '' }: PathDisplayProps) {
  const displayPath = useMemo(() => shortenPath(path, maxSegments), [path, maxSegments])

  return (
    <span 
      className={`text-sm text-muted-foreground bg-muted px-2 py-1 rounded font-mono truncate ${className}`}
      title={path}
    >
      {displayPath}
    </span>
  )
}
