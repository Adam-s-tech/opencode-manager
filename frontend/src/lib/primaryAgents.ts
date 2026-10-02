export function getPrimaryAgents<T extends { mode?: string; hidden?: boolean }>(
  agents: readonly T[] | undefined,
): T[] {
  return agents?.filter(
    (agent) => (agent.mode === 'primary' || agent.mode === 'all') && !agent.hidden,
  ) ?? []
}

export function getNextPrimaryAgentId<T extends { id: string; mode?: string; hidden?: boolean }>(
  agents: readonly T[] | undefined,
  currentAgentId: string,
): string | undefined {
  const primaryAgents = getPrimaryAgents(agents)

  if (primaryAgents.length === 0) return undefined

  const normalizedAgentId = currentAgentId.toLowerCase()
  const currentIndex = primaryAgents.findIndex(
    (agent) => agent.id.toLowerCase() === normalizedAgentId,
  )

  if (currentIndex === -1) return primaryAgents[0].id

  return primaryAgents[(currentIndex + 1) % primaryAgents.length].id
}
