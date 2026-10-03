import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CreatePreviewSessionResponse } from '@opencode-manager/shared/types'
import { ExternalLink, Globe, Loader2, Monitor, RefreshCw, Smartphone, Tablet, X } from 'lucide-react'
import { createPreviewSession, usePreviewPorts } from '@/api/preview'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useMobile } from '@/hooks/useMobile'
import { useUrlParams } from '@/hooks/useUrlParams'
import { buildPreviewStartUrl, getPreviewOrigin, isSameOriginAsManager } from '@/lib/preview-url'
import { cn } from '@/lib/utils'

interface PreviewPanelProps {
  isOpen: boolean
  onClose: () => void
  directory: string | undefined
}

type ViewportPreset = 'mobile' | 'tablet' | 'full'

const VIEWPORT_WIDTHS: Record<ViewportPreset, number | null> = {
  mobile: 390,
  tablet: 820,
  full: null,
}

const VIEWPORT_PRESETS: Array<{ preset: ViewportPreset; label: string; icon: typeof Monitor }> = [
  { preset: 'mobile', label: 'Mobile viewport', icon: Smartphone },
  { preset: 'tablet', label: 'Tablet viewport', icon: Tablet },
  { preset: 'full', label: 'Full width viewport', icon: Monitor },
]

const PORT_WAIT_TIMEOUT_MS = 60_000

interface ActiveSession {
  targetPort: number
  path: string
  renderKey: number
  data: CreatePreviewSessionResponse
}

function isInsideDirectory(cwd: string | null, directory: string | undefined): boolean {
  if (!cwd || !directory) return false
  if (cwd === directory) return true
  const prefix = directory.endsWith('/') ? directory : `${directory}/`
  return cwd.startsWith(prefix)
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function PreviewPanel({ isOpen, onClose, directory }: PreviewPanelProps) {
  const isMobile = useMobile()
  const { searchParams, updateParams } = useUrlParams()

  const requestedPort = useMemo(() => {
    const raw = searchParams.get('previewPort')
    if (!raw) return undefined
    const port = Number(raw)
    return Number.isInteger(port) && port > 0 && port <= 65535 ? port : undefined
  }, [searchParams])
  const requestedPath = searchParams.get('previewPath') || '/'

  const [pathDraft, setPathDraft] = useState(requestedPath)
  const [viewport, setViewport] = useState<ViewportPreset>('full')
  const [session, setSession] = useState<ActiveSession | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [waitExpired, setWaitExpired] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)
  const sessionPortRef = useRef<number | null>(null)
  const activePathRef = useRef<string | null>(null)
  const requestIdRef = useRef(0)

  const portsQuery = usePreviewPorts(directory, {
    enabled: isOpen,
    refetchInterval: isOpen ? 2000 : false,
  })
  const ports = useMemo(() => portsQuery.data?.ports ?? [], [portsQuery.data])
  const enabled = portsQuery.data?.enabled ?? true
  const portListed = requestedPort !== undefined && ports.some((entry) => entry.port === requestedPort)

  useEffect(() => {
    setPathDraft(requestedPath)
  }, [requestedPath])

  useEffect(() => {
    if (!isOpen) {
      requestIdRef.current += 1
      sessionPortRef.current = null
      activePathRef.current = null
      setSession(null)
      setSessionError(null)
    }
  }, [isOpen])

  useEffect(() => {
    if (portListed) return
    requestIdRef.current += 1
    sessionPortRef.current = null
    activePathRef.current = null
    setSession(null)
  }, [portListed])

  useEffect(() => {
    if (!isOpen || !requestedPort || !enabled || portListed) {
      setWaitExpired(false)
      return
    }
    setWaitExpired(false)
    const timer = setTimeout(() => setWaitExpired(true), PORT_WAIT_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [isOpen, requestedPort, enabled, portListed, retryNonce])

  const startSession = useCallback((port: number, path: string) => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    sessionPortRef.current = port
    activePathRef.current = path
    setSessionError(null)
    setSession(null)
    return createPreviewSession(port)
      .then((data) => {
        if (requestIdRef.current !== requestId) return
        setSession({ targetPort: port, path, renderKey: requestId, data })
      })
      .catch((error: unknown) => {
        if (requestIdRef.current !== requestId) return
        sessionPortRef.current = null
        activePathRef.current = null
        setSessionError(errorMessage(error, 'Failed to start preview'))
      })
  }, [])

  useEffect(() => {
    if (!isOpen || !requestedPort || !enabled || !portListed) return
    if (sessionPortRef.current === requestedPort && activePathRef.current === requestedPath) return
    void startSession(requestedPort, requestedPath)
  }, [isOpen, requestedPort, requestedPath, enabled, portListed, startSession])

  const selectPort = useCallback((port: number) => {
    updateParams((params) => {
      params.set('previewPort', String(port))
      params.delete('previewPath')
    }, 'replace')
  }, [updateParams])

  const reload = useCallback(() => {
    if (!requestedPort) return
    void startSession(requestedPort, requestedPath)
  }, [requestedPort, requestedPath, startSession])

  const handleGo = useCallback(() => {
    const nextPath = pathDraft.trim() || '/'
    updateParams((params) => {
      params.set('previewPath', nextPath)
    }, 'replace')
    if (requestedPort) {
      void startSession(requestedPort, nextPath)
    }
  }, [pathDraft, requestedPort, updateParams, startSession])

  const handleOpenInNewTab = useCallback(() => {
    if (!requestedPort) return
    createPreviewSession(requestedPort)
      .then((data) => {
        window.open(buildPreviewStartUrl(data, requestedPath), '_blank', 'noopener,noreferrer')
      })
      .catch((error: unknown) => {
        setSessionError(errorMessage(error, 'Failed to open preview'))
      })
  }, [requestedPort, requestedPath])

  const retry = useCallback(() => {
    if (portListed && requestedPort) {
      void startSession(requestedPort, requestedPath)
      return
    }
    setWaitExpired(false)
    setRetryNonce((nonce) => nonce + 1)
    void portsQuery.refetch()
  }, [portListed, requestedPort, requestedPath, startSession, portsQuery])

  const activeSession = session && session.targetPort === requestedPort ? session : null
  const previewOrigin = activeSession ? getPreviewOrigin(activeSession.data) : null
  const sameOrigin = previewOrigin ? isSameOriginAsManager(previewOrigin) : false
  const viewportWidth = VIEWPORT_WIDTHS[viewport]

  const renderMessage = (message: ReactNode, options: { retry?: boolean; alert?: boolean } = {}) => (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
      <div role={options.alert ? 'alert' : undefined} className="flex items-center gap-2">
        {message}
      </div>
      {options.retry && (
        <Button size="sm" variant="outline" onClick={retry}>
          Retry
        </Button>
      )}
    </div>
  )

  const body = () => {
    if (!enabled) {
      return renderMessage('Preview is disabled (PREVIEW_PORT=0)')
    }
    if (!requestedPort) {
      return renderMessage('Select a port to preview')
    }
    if (!portListed) {
      if (waitExpired) {
        return renderMessage(`Port ${requestedPort} is not listening`, { retry: true, alert: true })
      }
      return renderMessage(
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Waiting for port {requestedPort}…
        </>,
      )
    }
    if (sessionError) {
      return renderMessage(sessionError, { retry: true, alert: true })
    }
    if (activeSession) {
      if (sameOrigin) {
        return renderMessage('Preview must run on a different origin than OpenCode Manager.', { alert: true })
      }
      return (
        <div className="flex h-full justify-center overflow-hidden">
          <iframe
            key={activeSession.renderKey}
            title="Preview"
            src={buildPreviewStartUrl(activeSession.data, activeSession.path)}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
            className="h-full border-0 bg-white"
            style={{ width: viewportWidth ?? '100%', maxWidth: '100%' }}
          />
        </div>
      )
    }
    return renderMessage(
      <>
        <Loader2 className="h-4 w-4 animate-spin" />
        Starting preview…
      </>,
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        mobileFullscreen
        hideCloseButton={isMobile}
        className={cn(
          'p-0 flex flex-col bg-card border-border gap-0',
          isMobile ? 'h-full' : 'w-[90vw] sm:max-w-6xl h-[90vh] sm:pb-0',
        )}
      >
        <DialogHeader className={cn('px-4 py-2 border-b border-border flex-shrink-0', isMobile && 'relative')}>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Preview
          </DialogTitle>
          {isMobile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close preview panel"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 p-0"
            >
              <X className="h-6 w-6" />
            </Button>
          )}
        </DialogHeader>

        <div className="flex items-center gap-2 border-b border-border px-3 py-2 flex-shrink-0">
          <input
            aria-label="Preview path"
            value={pathDraft}
            onChange={(event) => setPathDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') handleGo() }}
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm"
            placeholder="/"
          />
          <Button size="sm" variant="outline" onClick={handleGo} disabled={!requestedPort}>
            Go
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={reload}
            disabled={!requestedPort}
            aria-label="Reload preview"
            className="h-8 w-8 p-0"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleOpenInNewTab}
            disabled={!requestedPort}
            aria-label="Open preview in new tab"
            className="h-8 w-8 p-0"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
          <div className="ml-auto flex items-center gap-1">
            {VIEWPORT_PRESETS.map(({ preset, label, icon: Icon }) => (
              <Button
                key={preset}
                size="sm"
                variant={viewport === preset ? 'secondary' : 'ghost'}
                onClick={() => setViewport(preset)}
                aria-label={label}
                aria-pressed={viewport === preset}
                className="h-8 w-8 p-0"
              >
                <Icon className="h-4 w-4" />
              </Button>
            ))}
          </div>
        </div>

        {enabled && ports.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2 flex-shrink-0">
            {ports.map((entry) => (
              <button
                key={entry.port}
                type="button"
                onClick={() => selectPort(entry.port)}
                title={entry.cwd ?? undefined}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
                  entry.port === requestedPort
                    ? 'border-primary text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="font-medium">:{entry.port}</span>
                {entry.command && <span className="truncate">{entry.command}</span>}
                {isInsideDirectory(entry.cwd, directory) && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">this repo</span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="relative flex-1 min-h-0">{body()}</div>
      </DialogContent>
    </Dialog>
  )
}
