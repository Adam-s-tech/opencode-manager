import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateTerminalRequest, ResizeTerminalRequest, TerminalInfo } from '@opencode-manager/shared/types'
import { API_BASE_URL } from '@/config'
import { fetchWrapper, fetchWrapperVoid } from './fetchWrapper'

function terminalsQueryKey(repoId: number, directory: string | undefined) {
  return ['terminals', repoId, directory ?? null] as const
}

function terminalsRepoQueryKey(repoId: number) {
  return ['terminals', repoId] as const
}

async function listTerminals(repoId: number, directory?: string): Promise<TerminalInfo[]> {
  const data = await fetchWrapper<{ terminals: TerminalInfo[] }>(
    `${API_BASE_URL}/api/repos/${repoId}/terminals`,
    { params: { directory } },
  )
  return data.terminals
}

async function createTerminal(repoId: number, body: CreateTerminalRequest): Promise<TerminalInfo> {
  return fetchWrapper<TerminalInfo>(`${API_BASE_URL}/api/repos/${repoId}/terminals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function resizeTerminal(repoId: number, ptyID: string, body: ResizeTerminalRequest): Promise<void> {
  return fetchWrapperVoid(`${API_BASE_URL}/api/repos/${repoId}/terminals/${encodeURIComponent(ptyID)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function removeTerminal(repoId: number, ptyID: string, directory?: string): Promise<void> {
  return fetchWrapperVoid(`${API_BASE_URL}/api/repos/${repoId}/terminals/${encodeURIComponent(ptyID)}`, {
    method: 'DELETE',
    params: { directory },
  })
}

interface UseTerminalsOptions {
  enabled: boolean
  refetchInterval?: number | false
}

export function useTerminals(repoId: number, directory: string | undefined, options: UseTerminalsOptions) {
  return useQuery({
    queryKey: terminalsQueryKey(repoId, directory),
    queryFn: () => listTerminals(repoId, directory),
    enabled: options.enabled,
    refetchInterval: options.refetchInterval,
  })
}

export function useCreateTerminal(repoId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateTerminalRequest) => createTerminal(repoId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: terminalsRepoQueryKey(repoId) })
    },
  })
}

interface RemoveTerminalVariables {
  ptyID: string
  directory?: string
}

export function useRemoveTerminal(repoId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ptyID, directory }: RemoveTerminalVariables) => removeTerminal(repoId, ptyID, directory),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: terminalsRepoQueryKey(repoId) })
    },
  })
}
