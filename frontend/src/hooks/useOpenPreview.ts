import { useCallback } from 'react'
import { useUrlParams } from './useUrlParams'

export function useOpenPreview(): (port: number, path?: string) => void {
  const { updateParams } = useUrlParams()

  return useCallback(
    (port: number, path = '/') => {
      updateParams((params) => {
        params.set('dialog', 'preview')
        params.set('previewPort', String(port))
        params.set('previewPath', path)
        params.delete('mobileTab')
      }, 'push')
    },
    [updateParams],
  )
}
