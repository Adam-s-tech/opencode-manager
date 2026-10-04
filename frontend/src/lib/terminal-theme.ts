import type { ITheme } from '@xterm/xterm'

const BASE_TOKENS = {
  background: 'background',
  foreground: 'foreground',
  cursor: 'primary',
  selectionBackground: 'accent',
} as const

const ANSI_TOKENS = {
  black: 'muted',
  red: 'destructive',
  green: 'success',
  yellow: 'warning',
  blue: 'info',
  magenta: 'highlight',
  cyan: 'syntax-property',
  white: 'foreground',
} as const

type AnsiName = keyof typeof ANSI_TOKENS

function collectTokenColors(root: HTMLElement): Map<string, string> {
  const tokens = new Set<string>([
    ...Object.values(BASE_TOKENS),
    ...Object.values(ANSI_TOKENS),
  ])

  const probes = new Map<string, HTMLSpanElement>()
  for (const token of tokens) {
    const probe = document.createElement('span')
    probe.style.color = `var(--color-${token})`
    probe.style.position = 'absolute'
    probe.style.width = '0'
    probe.style.height = '0'
    probe.style.overflow = 'hidden'
    probe.style.opacity = '0'
    probe.style.pointerEvents = 'none'
    root.appendChild(probe)
    probes.set(token, probe)
  }

  const colors = new Map<string, string>()
  for (const [token, probe] of probes) {
    colors.set(token, getComputedStyle(probe).color)
    root.removeChild(probe)
  }
  return colors
}

function ansiTheme(colors: Map<string, string>): Record<AnsiName | `bright${Capitalize<AnsiName>}`, string | undefined> {
  const theme = {} as Record<AnsiName | `bright${Capitalize<AnsiName>}`, string | undefined>
  for (const name of Object.keys(ANSI_TOKENS) as AnsiName[]) {
    const color = colors.get(ANSI_TOKENS[name])
    theme[name] = color
    theme[`bright${name[0].toUpperCase()}${name.slice(1)}` as `bright${Capitalize<AnsiName>}`] = color
  }
  return theme
}

export function resolveTerminalTheme(root: HTMLElement): ITheme {
  const colors = collectTokenColors(root)
  return {
    background: colors.get(BASE_TOKENS.background),
    foreground: colors.get(BASE_TOKENS.foreground),
    cursor: colors.get(BASE_TOKENS.cursor),
    selectionBackground: colors.get(BASE_TOKENS.selectionBackground),
    ...ansiTheme(colors),
  }
}
