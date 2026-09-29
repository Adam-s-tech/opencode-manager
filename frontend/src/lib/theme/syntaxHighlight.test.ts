import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { resolveColorThemeTokens } from './colorTheme'

const themeDir = path.dirname(fileURLToPath(import.meta.url))

const indexCss = readFileSync(path.resolve(themeDir, '../../index.css'), 'utf8')
const textPart = readFileSync(
  path.resolve(themeDir, '../../components/message/TextPart.tsx'),
  'utf8',
)

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1
}

describe('syntax highlight stylesheet', () => {
  it('does not import GitHub highlight.js stylesheets', () => {
    expect(indexCss).not.toContain('highlight.js/styles')
    expect(textPart).not.toContain('highlight.js/styles')
  })

  it('does not use highlight-light or highlight-dark cascade layers', () => {
    expect(indexCss).not.toContain('@layer highlight-light')
    expect(indexCss).not.toContain('@layer highlight-dark')
  })

  it('maps every syntax token to a theme variable consumed by a .hljs rule', () => {
    const dark = resolveColorThemeTokens('dracula', true)
    const syntaxKeys = Object.keys(dark ?? {}).filter((key) => key.startsWith('syntax-'))

    expect(syntaxKeys.length).toBeGreaterThan(0)

    for (const key of syntaxKeys) {
      expect(indexCss).toContain(`var(--color-${key})`)
      expect(countOccurrences(indexCss, `--color-${key}:`)).toBe(2)
    }
  })
})
