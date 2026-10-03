import { useCallback } from 'react'
import { openDialogParam } from './useDialogParam'
import { useUrlParams } from './useUrlParams'

export function useOpenTerminal(): (
  terminalId: string,
  extraParams?: Record<string, string>,
) => void {
  const { updateParams } = useUrlParams()

  return useCallback(
    (terminalId: string, extraParams?: Record<string, string>) => {
      openDialogParam(updateParams, 'terminal', { terminal: terminalId, ...extraParams })
    },
    [updateParams],
  )
}
