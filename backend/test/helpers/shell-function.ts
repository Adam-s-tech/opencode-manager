import { readFileSync } from 'fs'

/**
 * Returns the source of a top-level `name() { ... }` function from a shell script so tests can run it in isolation.
 * Throws when the script does not define the function.
 */
export function extractShellFunction(scriptPath: string, name: string): string {
  const match = readFileSync(scriptPath, 'utf-8').match(new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}`, 'm'))
  if (!match) throw new Error(`${name}() not found in ${scriptPath}`)
  return match[0]
}
