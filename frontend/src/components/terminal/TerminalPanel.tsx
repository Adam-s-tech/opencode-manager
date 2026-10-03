import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TerminalInfo } from '@opencode-manager/shared/types'
import { Plus, SquareTerminal, X } from 'lucide-react'
import { useCreateTerminal, useRemoveTerminal, useTerminals } from '@/api/terminals'
import { Button } from '@/components/ui/button'
import { ConfirmDestructiveDialog } from '@/components/ui/confirm-destructive-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useMobile } from '@/hooks/useMobile'
import { useOpenPreview } from '@/hooks/useOpenPreview'
import { useUrlParams } from '@/hooks/useUrlParams'
import { openUrlFromManager } from '@/lib/open-url'
import { cn } from '@/lib/utils'
import { TerminalKeyBar } from './TerminalKeyBar'
import { TerminalView, type TerminalViewHandle } from './TerminalView'

interface TerminalPanelProps {
  repoId: number
  directory: string | undefined
  isOpen: boolean
  onClose: () => void
  onOpenLink?: (uri: string) => void
}

export function TerminalPanel({ repoId, directory, isOpen, onClose, onOpenLink }: TerminalPanelProps) {
  const isMobile = useMobile()
  const { searchParams, updateParams } = useUrlParams()
  const openPreview = useOpenPreview()
  const { data, isLoading, isSuccess, refetch } = useTerminals(repoId, directory, {
    enabled: isOpen && !!directory,
    refetchInterval: isOpen ? 5000 : false,
  })
  const { mutate: createTerminal, isPending: isCreating } = useCreateTerminal(repoId)
  const { mutate: removeTerminal, isPending: isRemoving } = useRemoveTerminal(repoId)

  const [ctrlArmed, setCtrlArmed] = useState(false)
  const [pendingClose, setPendingClose] = useState<TerminalInfo | null>(null)
  const viewHandlesRef = useRef(new Map<string, TerminalViewHandle>())
  const autoCreatedDirectoryRef = useRef<string | null>(null)

  const terminals = useMemo(() => data ?? [], [data])

  const selectTerminal = useCallback((id: string) => {
    updateParams((params) => {
      params.set('terminal', id)
    }, 'replace')
  }, [updateParams])

  const requestedTerminalId = searchParams.get('terminal')
  const activeTerminalId = requestedTerminalId && terminals.some((terminal) => terminal.id === requestedTerminalId)
    ? requestedTerminalId
    : terminals[0]?.id

  useEffect(() => {
    if (!isOpen || !directory) {
      autoCreatedDirectoryRef.current = null
      return
    }
    if (!isSuccess || terminals.length > 0) return
    if (autoCreatedDirectoryRef.current === directory) return
    autoCreatedDirectoryRef.current = directory
    createTerminal(
      { directory },
      { onSuccess: (terminal) => selectTerminal(terminal.id) },
    )
  }, [isOpen, directory, isSuccess, terminals.length, createTerminal, selectTerminal])

  const handleCreate = useCallback(() => {
    createTerminal(
      { directory },
      { onSuccess: (terminal) => selectTerminal(terminal.id) },
    )
  }, [createTerminal, directory, selectTerminal])

  const performRemove = useCallback((terminal: TerminalInfo) => {
    removeTerminal(
      { ptyID: terminal.id, directory },
      {
        onSuccess: () => {
          updateParams((params) => {
            if (params.get('terminal') === terminal.id) params.delete('terminal')
          }, 'replace')
        },
      },
    )
  }, [removeTerminal, directory, updateParams])

  const handleCloseTab = useCallback((terminal: TerminalInfo) => {
    if (terminal.status === 'running') {
      setPendingClose(terminal)
      return
    }
    performRemove(terminal)
  }, [performRemove])

  const handleKeySend = useCallback((input: string) => {
    if (!activeTerminalId) return
    viewHandlesRef.current.get(activeTerminalId)?.send(input)
  }, [activeTerminalId])

  const handleToggleCtrl = useCallback(() => setCtrlArmed((armed) => !armed), [])
  const handleCtrlConsumed = useCallback(() => setCtrlArmed(false), [])

  const handleOpenLink = useCallback((uri: string) => {
    openUrlFromManager(uri, { openPreview })
  }, [openPreview])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        mobileFullscreen
        hideCloseButton={isMobile}
        className={cn(
          'p-0 flex flex-col bg-card border-border gap-0',
          isMobile ? 'h-full' : 'w-[90vw] sm:max-w-5xl h-[90vh] sm:pb-0',
        )}
      >
        <DialogHeader className={cn('px-4 py-2 border-b border-border flex-shrink-0', isMobile && 'relative')}>
          <DialogTitle className="flex items-center gap-2">
            <SquareTerminal className="w-5 h-5" />
            Terminal
          </DialogTitle>
          {isMobile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close terminal panel"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 p-0"
            >
              <X className="h-6 w-6" />
            </Button>
          )}
        </DialogHeader>

        <div className="flex items-center gap-1 border-b border-border flex-shrink-0 overflow-x-auto px-1">
          {terminals.map((terminal) => (
            <div
              key={terminal.id}
              className={cn(
                'flex items-center gap-1 rounded-t-md border-b-2 px-2 py-1.5 text-sm transition-colors flex-shrink-0',
                terminal.id === activeTerminalId
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <button
                type="button"
                onClick={() => selectTerminal(terminal.id)}
                className="flex max-w-[12rem] items-center gap-1.5"
              >
                <span className="truncate">{terminal.title}</span>
                {terminal.status === 'exited' && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {terminal.exitCode !== undefined ? `exited (${terminal.exitCode})` : 'exited'}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleCloseTab(terminal)}
                aria-label={`Close ${terminal.title}`}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCreate}
            disabled={!directory || isCreating}
            aria-label="New terminal"
            className="h-7 w-7 p-0 flex-shrink-0"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="relative flex-1 min-h-0">
          {terminals.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {isLoading || isCreating ? 'Starting terminal...' : 'No terminals'}
            </div>
          ) : (
            terminals.map((terminal) => (
              <TerminalView
                key={terminal.id}
                ref={(handle) => {
                  if (handle) viewHandlesRef.current.set(terminal.id, handle)
                  else viewHandlesRef.current.delete(terminal.id)
                }}
                repoId={repoId}
                directory={directory}
                ptyID={terminal.id}
                active={terminal.id === activeTerminalId}
                ctrlArmed={ctrlArmed}
                onCtrlConsumed={handleCtrlConsumed}
                onOpenLink={onOpenLink ?? handleOpenLink}
                onExited={() => { void refetch() }}
              />
            ))
          )}
        </div>

        {isMobile && terminals.length > 0 && (
          <TerminalKeyBar onSend={handleKeySend} ctrlArmed={ctrlArmed} onToggleCtrl={handleToggleCtrl} />
        )}

        <ConfirmDestructiveDialog
          open={pendingClose !== null}
          onOpenChange={(open) => { if (!open) setPendingClose(null) }}
          onConfirm={() => {
            if (pendingClose) performRemove(pendingClose)
            setPendingClose(null)
          }}
          onCancel={() => setPendingClose(null)}
          title="Close Terminal"
          description="Stop the running process?"
          confirmLabel="Stop"
          pendingLabel="Stopping..."
          isPending={isRemoving}
        />
      </DialogContent>
    </Dialog>
  )
}
