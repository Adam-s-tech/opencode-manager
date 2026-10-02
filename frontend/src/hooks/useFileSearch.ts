import { useQuery } from '@tanstack/react-query'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { findFiles } from '@/api/opencode'

export interface FileSearchResult {
  files: string[]
  isLoading: boolean
  error: Error | null
}

export function useFileSearch(
  query: string,
  enabled: boolean = true,
  directory?: string
): FileSearchResult {
  const debouncedQuery = useDebouncedValue(query, 300)

  const { data, isLoading, error } = useQuery({
    queryKey: ['file-search', debouncedQuery, directory],
    queryFn: () => findFiles({ directory, query: debouncedQuery }),
    enabled: enabled && !!debouncedQuery,
    staleTime: 60000,
  })

  return {
    files: data || [],
    isLoading,
    error: error as Error | null
  }
}
