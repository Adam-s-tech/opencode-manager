import { useCallback } from 'react'
import { openDialogParam } from './useDialogParam'
import { useUrlParams } from './useUrlParams'

export function useOpenPreview(): (port: number, path?: string) => void {
  const { updateParams } = useUrlParams()

  return useCallback(
    (port: number, path = '/') => {
      openDialogParam(updateParams, 'preview', {
        previewPort: String(port),
        previewPath: path,
      })
    },
    [updateParams],
  )
}
