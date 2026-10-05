import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface TerminalKeyBarProps {
  onSend: (data: string) => void
  ctrlArmed: boolean
  onToggleCtrl: () => void
}

interface SpecialKey {
  label: string
  data: string
  ariaLabel?: string
}

const ESCAPE_KEY = '\x1b'
const TAB_KEY = '\t'

const ARROW_KEYS: SpecialKey[] = [
  { label: '↑', data: '\x1b[A', ariaLabel: 'Arrow up' },
  { label: '↓', data: '\x1b[B', ariaLabel: 'Arrow down' },
  { label: '←', data: '\x1b[D', ariaLabel: 'Arrow left' },
  { label: '→', data: '\x1b[C', ariaLabel: 'Arrow right' },
]

const SYMBOL_KEYS: SpecialKey[] = [
  { label: '|', data: '|' },
  { label: '~', data: '~' },
  { label: '/', data: '/' },
]

const KEY_CLASS_NAME = 'h-11 flex-1 px-2 font-mono text-sm'

export function TerminalKeyBar({ onSend, ctrlArmed, onToggleCtrl }: TerminalKeyBarProps) {
  const renderKey = (key: SpecialKey) => (
    <Button
      key={key.label}
      type="button"
      variant="ghost"
      size="sm"
      className={KEY_CLASS_NAME}
      aria-label={key.ariaLabel}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onSend(key.data)}
    >
      {key.label}
    </Button>
  )

  return (
    <div
      className="flex flex-shrink-0 items-center gap-1 overflow-x-auto border-t border-border bg-card p-1"
      data-testid="terminal-key-bar"
    >
      {renderKey({ label: 'Esc', data: ESCAPE_KEY })}
      {renderKey({ label: 'Tab', data: TAB_KEY })}
      <Button
        type="button"
        variant={ctrlArmed ? 'default' : 'ghost'}
        size="sm"
        className={cn(KEY_CLASS_NAME, ctrlArmed && 'bg-primary text-primary-foreground')}
        aria-pressed={ctrlArmed}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onToggleCtrl}
      >
        Ctrl
      </Button>
      {ARROW_KEYS.map(renderKey)}
      {SYMBOL_KEYS.map(renderKey)}
    </div>
  )
}
