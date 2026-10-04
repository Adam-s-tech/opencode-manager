import { useCallback } from 'react'
import { useUrlParams } from './useUrlParams'

function setDialogParams(
  params: URLSearchParams,
  name: string,
  extraParams?: Record<string, string>,
): void {
  params.set('dialog', name)
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      params.set(key, value)
    }
  }
}

export function dialogSearch(name: string, extraParams?: Record<string, string>): string {
  const params = new URLSearchParams()
  setDialogParams(params, name, extraParams)
  return `?${params.toString()}`
}

export function openDialogParam(
  updateParams: ReturnType<typeof useUrlParams>['updateParams'],
  name: string,
  extraParams?: Record<string, string>,
): void {
  updateParams((p) => {
    setDialogParams(p, name, extraParams)
    p.delete('mobileTab')
  }, 'push')
}

export function useDialogParam(name: string): [boolean, (open: boolean) => void] {
  const { searchParams, updateParams } = useUrlParams()

  const isOpen = searchParams.get('dialog') === name

  const setOpen = useCallback(
    (open: boolean) => {
      if (open) {
        openDialogParam(updateParams, name)
        return
      }
      updateParams((p) => {
        if (p.get('dialog') === name) {
          p.delete('dialog')
        }
      }, 'replace')
    },
    [updateParams, name],
  )

  return [isOpen, setOpen]
}
