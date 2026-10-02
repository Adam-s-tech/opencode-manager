import { describe, it, expect } from 'vitest'
import { getPrimaryAgents, getNextPrimaryAgentId } from './primaryAgents'

interface TestAgent {
  id: string
  mode?: string
  hidden?: boolean
}

describe('getPrimaryAgents', () => {
  it('keeps primary and all agents that are not hidden', () => {
    const agents: TestAgent[] = [
      { id: 'primary', mode: 'primary' },
      { id: 'all', mode: 'all' },
      { id: 'sub', mode: 'subagent' },
      { id: 'hidden', mode: 'primary', hidden: true },
    ]

    expect(getPrimaryAgents(agents).map((agent) => agent.id)).toEqual(['primary', 'all'])
  })

  it('returns an empty array for undefined or empty input', () => {
    expect(getPrimaryAgents(undefined)).toEqual([])
    expect(getPrimaryAgents([])).toEqual([])
  })
})

describe('getNextPrimaryAgentId', () => {
  const agents: TestAgent[] = [
    { id: 'build', mode: 'primary' },
    { id: 'plan', mode: 'primary' },
    { id: 'sub', mode: 'subagent' },
    { id: 'hidden', mode: 'primary', hidden: true },
  ]

  it('returns the next primary agent', () => {
    expect(getNextPrimaryAgentId(agents, 'build')).toBe('plan')
  })

  it('wraps around after the last primary agent', () => {
    expect(getNextPrimaryAgentId(agents, 'plan')).toBe('build')
  })

  it('matches the current agent id case-insensitively', () => {
    expect(getNextPrimaryAgentId(agents, 'BUILD')).toBe('plan')
  })

  it('returns the first primary agent when the current agent is unknown', () => {
    expect(getNextPrimaryAgentId(agents, 'missing')).toBe('build')
  })

  it('returns undefined when there are no primary agents', () => {
    expect(getNextPrimaryAgentId(undefined, 'build')).toBeUndefined()
    expect(getNextPrimaryAgentId([{ id: 'sub', mode: 'subagent' }], 'build')).toBeUndefined()
  })
})
