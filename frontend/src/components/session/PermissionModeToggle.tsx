import { Shield, ShieldCheck } from 'lucide-react'
import { useSessionPermissionMode, useSetSessionPermissionMode } from '@/hooks/useSessionPermissionMode'

interface PermissionModeToggleProps {
  sessionID: string
  directory: string
}

export function PermissionModeToggle({ sessionID, directory }: PermissionModeToggleProps) {
  const { data, isError } = useSessionPermissionMode(sessionID)
  const setMode = useSetSessionPermissionMode(sessionID)

  const loaded = data !== undefined
  const isAuto = data?.mode === 'auto'
  const inherited = data?.inherited ?? false
  const disabled = !loaded || inherited || setMode.isPending

  const label = !loaded
    ? isError
      ? 'Permissions: unavailable'
      : 'Permissions: loading'
    : inherited
      ? 'Inherited from parent session'
      : isAuto
        ? 'Permissions: accept everything'
        : 'Permissions: ask every time'

  const handleClick = () => {
    if (disabled) return
    setMode.mutate({ directory, mode: isAuto ? 'ask' : 'auto' })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`p-2 rounded-lg transition-all duration-200 active:scale-95 hover:scale-105 shadow-md border disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 disabled:hover:scale-100 ${
        isAuto
          ? 'bg-highlight hover:bg-highlight/90 text-highlight-foreground border-highlight'
          : 'bg-muted hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground border-border'
      }`}
    >
      {isAuto ? <ShieldCheck className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
    </button>
  )
}
