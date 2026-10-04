import { useQuery } from '@tanstack/react-query'
import { listBranches } from '@/api/repos'

export function useRepoBranches(repoId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: ['branches', repoId],
    queryFn: () => listBranches(repoId!),
    enabled: enabled && repoId !== undefined,
    staleTime: 30000,
  })
}
