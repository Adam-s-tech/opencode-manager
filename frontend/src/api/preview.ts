import { useQuery } from '@tanstack/react-query'
import type { CreatePreviewSessionResponse, PreviewPortsResponse } from '@opencode-manager/shared/types'
import { API_BASE_URL } from '@/config'
import { fetchWrapper } from './fetchWrapper'

function previewPortsQueryKey(directory: string | undefined) {
  return ['previewPorts', directory ?? null] as const
}

function listPreviewPorts(directory?: string): Promise<PreviewPortsResponse> {
  return fetchWrapper(`${API_BASE_URL}/api/preview/ports`, {
    params: { directory },
  })
}

export function createPreviewSession(port: number): Promise<CreatePreviewSessionResponse> {
  return fetchWrapper(`${API_BASE_URL}/api/preview/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ port }),
  })
}

export interface UsePreviewPortsOptions {
  enabled: boolean
  refetchInterval?: number | false
}

export function usePreviewPorts(directory: string | undefined, options: UsePreviewPortsOptions) {
  return useQuery({
    queryKey: previewPortsQueryKey(directory),
    queryFn: () => listPreviewPorts(directory),
    enabled: options.enabled,
    refetchInterval: options.refetchInterval,
  })
}
