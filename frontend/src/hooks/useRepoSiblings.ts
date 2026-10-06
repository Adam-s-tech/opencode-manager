import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createRepoWorkspace, deleteRepoWorkspace, getRepoSiblings, type RepoSibling } from '@/api/repos'
import { showToast } from '@/lib/toast'
import type { CreateRepoWorkspaceRequest } from '@opencode-manager/shared/types'

export function repoSiblingsQueryKey(repoId: number | undefined) {
  return ['repo', 'siblings', repoId] as const
}

export function useRepoSiblings(repoId: number | undefined) {
  return useQuery<RepoSibling[]>({
    queryKey: repoSiblingsQueryKey(repoId),
    queryFn: () => getRepoSiblings(repoId!),
    enabled: !!repoId && repoId > 0,
    staleTime: 30_000,
  })
}

export function useDeleteRepoWorkspaces(repoId: number | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (directories: string[]) => {
      if (!repoId) throw new Error('Repo id is required')
      const results = await Promise.allSettled(
        directories.map((directory) => deleteRepoWorkspace(repoId, directory)),
      )
      const failures = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []))
      return { total: directories.length, failed: failures.length, firstError: failures[0] instanceof Error ? failures[0].message : null }
    },
    onSuccess: ({ total, failed, firstError }) => {
      queryClient.invalidateQueries({ queryKey: repoSiblingsQueryKey(repoId) })
      queryClient.invalidateQueries({ queryKey: ['schedule-worktrees'] })
      queryClient.invalidateQueries({ queryKey: ['all-schedules'] })
      const deleted = total - failed
      const reason = firstError ? `: ${firstError}` : ''
      if (failed === 0) {
        showToast.success(deleted === 1 ? 'Worktree deleted' : `${deleted} worktrees deleted`)
      } else if (deleted === 0) {
        showToast.error(`Failed to delete worktrees${reason}`)
      } else {
        showToast.error(`Deleted ${deleted}, failed ${failed}${reason}`)
      }
    },
    onError: () => {
      showToast.error('Failed to delete worktrees')
    },
  })
}

export function useCreateRepoWorkspace(repoId: number | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (request: CreateRepoWorkspaceRequest = {}) => {
      if (!repoId) throw new Error('Repo id is required')
      return createRepoWorkspace(repoId, request)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repoSiblingsQueryKey(repoId) })
      showToast.success('Worktree created')
    },
    onError: (error) => {
      showToast.error(`Failed to create worktree: ${error.message}`)
    },
  })
}
