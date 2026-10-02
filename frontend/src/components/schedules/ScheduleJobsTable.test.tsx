import { describe, it, expect, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScheduleJobsTable } from './ScheduleJobsTable'
import type { ScheduleJobWithRepo, ScheduleRunSummary } from '@/api/schedules'

function makeJob(overrides: Partial<ScheduleJobWithRepo> = {}): ScheduleJobWithRepo {
  return {
    id: 1,
    repoId: 42,
    name: 'Weekly summary',
    description: 'Summarize the week',
    enabled: true,
    scheduleMode: 'interval',
    intervalMinutes: 60,
    cronExpression: null,
    timezone: null,
    agentSlug: null,
    prompt: 'Summarize the week',
    model: null,
    skillMetadata: null,
    permissionConfig: null,
    mcpServers: [],
    branch: null,
    createdAt: 0,
    updatedAt: 0,
    lastRunAt: null,
    nextRunAt: null,
    repoName: 'my-repo',
    repoPath: '/home/user/my-repo',
    repoUrl: 'https://example.com/my-repo',
    lastRun: null,
    ...overrides,
  }
}

function makeRun(overrides: Partial<ScheduleRunSummary> = {}): ScheduleRunSummary {
  return {
    id: 9,
    status: 'completed',
    startedAt: Date.now() - 60_000,
    finishedAt: Date.now() - 30_000,
    viewedAt: Date.now(),
    preview: null,
    ...overrides,
  }
}

function renderTable(jobs: ScheduleJobWithRepo[], props: Partial<ComponentProps<typeof ScheduleJobsTable>> = {}) {
  return render(
    <ScheduleJobsTable
      jobs={jobs}
      showRepo
      onOpen={vi.fn()}
      {...props}
    />,
  )
}

describe('ScheduleJobsTable', () => {
  it('renders a semantic table with column headers', () => {
    renderTable([makeJob()])

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Job' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Repo' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Last result' })).toBeInTheDocument()
  })

  it('shows the NEW pill for an unread completed run', () => {
    renderTable([makeJob({ lastRun: makeRun({ status: 'completed', viewedAt: null }) })])

    expect(screen.getAllByText('NEW').length).toBeGreaterThan(0)
  })

  it('styles a failed preview with destructive text', () => {
    renderTable([makeJob({ lastRun: makeRun({ status: 'failed', viewedAt: 123, preview: 'Boom' }) })])

    for (const preview of screen.getAllByText('Boom')) {
      expect(preview).toHaveClass('text-destructive/80')
    }
  })

  it('shows a Cancel button for a running job', () => {
    renderTable(
      [makeJob({ lastRun: makeRun({ status: 'running', finishedAt: null, viewedAt: null }) })],
      { onCancelRun: vi.fn() },
    )

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('shows Resume and the Paused label for a paused job', () => {
    renderTable([makeJob({ enabled: false })], { onToggleEnabled: vi.fn() })

    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument()
    expect(screen.getByText('Paused')).toBeInTheDocument()
  })

  it('renders only the provided actions in the menu with Delete last', async () => {
    const user = userEvent.setup()
    renderTable([makeJob()], { onRunNow: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() })

    await user.click(screen.getByRole('button', { name: 'More actions' }))

    const items = await screen.findAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual(['Run now', 'Edit', 'Delete'])
    expect(items.at(-1)).toHaveClass('text-destructive')
  })

  it('calls onOpen when a row is clicked', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    renderTable([makeJob()], { onOpen })

    await user.click(screen.getByText('Weekly summary'))

    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
