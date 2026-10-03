import { useCallback, useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { resizeTerminal } from '@/api/terminals'
import { applyCtrlModifier } from '@/lib/terminal-protocol'
import { resolveTerminalTheme } from '@/lib/terminal-theme'
import { useTerminalSocket } from '@/hooks/useTerminalSocket'
import { useMobile } from '@/hooks/useMobile'
import { cn } from '@/lib/utils'

const RESIZE_DEBOUNCE_MS = 150

const MONOSPACE_FONT = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace'

function defaultOpenLink(uri: string) {
  window.open(uri, '_blank', 'noopener,noreferrer')
}

export interface TerminalViewProps {
  repoId: number
  directory: string | undefined
  ptyID: string
  active: boolean
  ctrlArmed: boolean
  onCtrlConsumed: () => void
  onOpenLink?: (uri: string) => void
  onExited: () => void
}

export function TerminalView({
  repoId,
  directory,
  ptyID,
  active,
  ctrlArmed,
  onCtrlConsumed,
  onOpenLink,
  onExited,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const sendRef = useRef<(data: string) => void>(() => {})
  const ctrlArmedRef = useRef(ctrlArmed)
  const onCtrlConsumedRef = useRef(onCtrlConsumed)
  const onOpenLinkRef = useRef(onOpenLink)
  const onExitedRef = useRef(onExited)
  const isMobile = useMobile()
  const isMobileRef = useRef(isMobile)

  ctrlArmedRef.current = ctrlArmed
  onCtrlConsumedRef.current = onCtrlConsumed
  onOpenLinkRef.current = onOpenLink
  onExitedRef.current = onExited
  isMobileRef.current = isMobile

  const handleOutput = useCallback((text: string) => {
    terminalRef.current?.write(text)
  }, [])

  const handleExit = useCallback(() => {
    terminalRef.current?.write('\r\n[process exited]\r\n')
    onExitedRef.current()
  }, [])

  const { send } = useTerminalSocket({
    repoId,
    directory,
    ptyID,
    onOutput: handleOutput,
    onExit: handleExit,
    enabled: true,
  })
  sendRef.current = send

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const terminal = new Terminal({
      cursorBlink: true,
      scrollback: 5000,
      fontFamily: MONOSPACE_FONT,
      fontSize: isMobileRef.current ? 12 : 13,
      theme: resolveTerminalTheme(document.documentElement),
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(
      new WebLinksAddon((_event, uri) => {
        const openLink = onOpenLinkRef.current ?? defaultOpenLink
        openLink(uri)
      }),
    )
    terminal.open(container)

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    const dataDisposable = terminal.onData((data) => {
      if (ctrlArmedRef.current) {
        sendRef.current(applyCtrlModifier(data))
        onCtrlConsumedRef.current()
        return
      }
      sendRef.current(data)
    })

    return () => {
      dataDisposable.dispose()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return
    terminal.options.fontSize = isMobile ? 12 : 13
    try {
      fitAddonRef.current?.fit()
    } catch {
      return
    }
  }, [isMobile])

  useEffect(() => {
    const root = document.documentElement
    const applyTheme = () => {
      const terminal = terminalRef.current
      if (!terminal) return
      terminal.options.theme = resolveTerminalTheme(root)
    }
    const observer = new MutationObserver(applyTheme)
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'style'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let timer: ReturnType<typeof setTimeout> | null = null

    const scheduleResize = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const terminal = terminalRef.current
        const fitAddon = fitAddonRef.current
        if (!terminal || !fitAddon) return
        try {
          fitAddon.fit()
        } catch {
          return
        }
        resizeTerminal(repoId, ptyID, { directory, cols: terminal.cols, rows: terminal.rows }).catch(() => {})
      }, RESIZE_DEBOUNCE_MS)
    }

    const observer = new ResizeObserver(scheduleResize)
    observer.observe(container)
    scheduleResize()

    return () => {
      observer.disconnect()
      if (timer) clearTimeout(timer)
    }
  }, [repoId, directory, ptyID])

  useEffect(() => {
    if (!active) return
    try {
      fitAddonRef.current?.fit()
    } catch {
      return
    }
    terminalRef.current?.focus()
  }, [active])

  return (
    <div
      ref={containerRef}
      className={cn('h-full w-full overflow-hidden', !active && 'hidden')}
      data-terminal-id={ptyID}
    />
  )
}
