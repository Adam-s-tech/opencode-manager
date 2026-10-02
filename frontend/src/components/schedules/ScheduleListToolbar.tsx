import type { ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface ScheduleListToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  children?: ReactNode
}

export function ScheduleListToolbar({ search, onSearchChange, searchPlaceholder, children }: ScheduleListToolbarProps) {
  return (
    <div className="flex items-center gap-2 pt-2 pb-1">
      <div className="relative min-w-0 flex-1">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && search) {
              event.stopPropagation()
              onSearchChange('')
            }
          }}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="h-9 pl-9 pr-8 [&::-webkit-search-cancel-button]:hidden"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {children}
    </div>
  )
}
