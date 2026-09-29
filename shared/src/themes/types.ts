export type HexColor = `#${string}`

export const OPENCODE_SYNTAX_TOKENS = [
  'comment',
  'keyword',
  'string',
  'primitive',
  'property',
  'type',
  'constant',
  'variable',
  'operator',
  'punctuation',
] as const

export type OpenCodeSyntaxToken = (typeof OPENCODE_SYNTAX_TOKENS)[number]

export type OpenCodeSyntaxPalette = Partial<Record<OpenCodeSyntaxToken, HexColor>>

export interface OpenCodeThemePalette {
  neutral: HexColor
  ink: HexColor
  primary: HexColor
  accent?: HexColor
  success: HexColor
  warning: HexColor
  error: HexColor
  info: HexColor
  diffAdd?: HexColor
  diffDelete?: HexColor
  textWeak?: HexColor
  syntax?: OpenCodeSyntaxPalette
}

export interface OpenCodeThemeDefinition {
  id: string
  name: string
  light: OpenCodeThemePalette
  dark: OpenCodeThemePalette
}
