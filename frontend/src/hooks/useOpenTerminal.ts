import { useCallback } from 'react'
import { openDialogParam, useDialogParam } from './useDialogParam'
import { useUrlParams } from './useUrlParams'

const TERMINAL_DIALOG = 'terminal'
const TERMINAL_DIALOG_PARAMS = ['terminal'] as const

export function useTerminalDialogParam(): [boolean, (open: boolean) => void] {
  return useDialogParam(TERMINAL_DIALOG, TERMINAL_DIALOG_PARAMS)
}

export function useOpenTerminal(): (
  terminalId: string,
  extraParams?: Record<string, string>,
) => void {
  const { updateParams } = useUrlParams()

  return useCallback(
    (terminalId: string, extraParams?: Record<string, string>) => {
      openDialogParam(updateParams, TERMINAL_DIALOG, { terminal: terminalId, ...extraParams })
    },
    [updateParams],
  )
}
