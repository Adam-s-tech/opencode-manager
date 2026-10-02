import { useQuery } from '@tanstack/react-query'
import { listCommands } from '@/api/opencode'
import type { CommandInfo } from '@opencode-manager/shared/opencode'
import { BUILTIN_COMMANDS } from '@/lib/builtinCommands'

function sortCommandsByName(commands: CommandInfo[]): CommandInfo[] {
  return [...commands].sort((a, b) => a.name.localeCompare(b.name))
}

function rankCommandMatch(command: CommandInfo, searchTerm: string): number {
  const name = command.name.toLowerCase()
  if (name === searchTerm) return 0
  if (name.startsWith(searchTerm)) return 1
  return 2
}

const SORTED_BUILTIN_COMMANDS = sortCommandsByName([...BUILTIN_COMMANDS])

interface UseCommandsOptions {
  directory?: string
  enabled?: boolean
}

export function useCommands(options: UseCommandsOptions = {}) {
  const { directory, enabled = true } = options

  const { data: commands, isLoading: loading, error } = useQuery({
    queryKey: ['opencode', 'commands', directory ?? null],
    queryFn: async () => {
      const loaded = await listCommands(directory)
      const allCommands = [...loaded, ...BUILTIN_COMMANDS]
      const uniqueCommands = allCommands.filter((command, index, self) =>
        index === self.findIndex((c) => c.name === command.name)
      )
      return sortCommandsByName(uniqueCommands)
    },
    enabled,
    initialData: SORTED_BUILTIN_COMMANDS,
  })

  const filterCommands = (query: string) => {
    if (!query.trim()) return commands

    const searchTerm = query.toLowerCase()
    return commands
      .filter(command => command.name.toLowerCase().includes(searchTerm))
      .sort((a, b) => {
        const rankDifference = rankCommandMatch(a, searchTerm) - rankCommandMatch(b, searchTerm)
        if (rankDifference !== 0) return rankDifference
        return a.name.localeCompare(b.name)
      })
  }

  return {
    commands,
    loading,
    error: error ? 'Failed to load commands' : null,
    filterCommands
  }
}
