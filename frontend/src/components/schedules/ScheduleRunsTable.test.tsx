import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScheduleRunsTable } from './ScheduleRunsTable'
import type { ScheduleRunWithContext } from '@/api/schedules'

function makeRun(overrides: Partial<ScheduleRunWithContext> = {}): ScheduleRunWithContext {
  return {
    id: 1,
    jobId: 7,
    repoId: 42,
    triggerSource: 'manual',
    status: 'completed',
    startedAt: Date.now() - 120_000,
    finishedAt: Date.now() - 60_000,
    viewedAt: 123,
    createdAt: Date.now() - 120_000,
    sessionId: 'ses-1',
    sessionTitle: 'Run title',
    logText: null,
    responseText: null,
    errorText: null,
    runBranch: null,
    commitHash: null,
    worktreePath: null,
    jobName: 'Weekly summary',
    repoName: 'my-repo',
    repoPath: '/home/user/my-repo',
    ...overrides,
  }
}

describe('ScheduleRunsTable', () => {
  it('renders a row per run with the job name', () => {
    render(
      <ScheduleRunsTable
        runs={[makeRun({ id: 1, jobName: 'First job' }), makeRun({ id: 2, jobName: 'Second job' })]}
        runsLoading={false}
        selectedRunId={null}
        onSelectRun={vi.fn()}
      />,
    )

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('First job')).toBeInTheDocument()
    expect(screen.getByText('Second job')).toBeInTheDocument()
  })

  it('shows the NEW pill for an unread run', () => {
    render(
      <ScheduleRunsTable
        runs={[makeRun({ status: 'completed', viewedAt: null })]}
        runsLoading={false}
        selectedRunId={null}
        onSelectRun={vi.fn()}
      />,
    )

    expect(screen.getByText('NEW')).toBeInTheDocument()
  })

  it('calls onSelectRun when a row is clicked', async () => {
    const user = userEvent.setup()
    const onSelectRun = vi.fn()
    render(
      <ScheduleRunsTable
        runs={[makeRun({ id: 42 })]}
        runsLoading={false}
        selectedRunId={null}
        onSelectRun={onSelectRun}
      />,
    )

    await user.click(screen.getByText('Weekly summary'))

    expect(onSelectRun).toHaveBeenCalledWith(42)
  })

  it('hides the delete button for running runs', () => {
    render(
      <ScheduleRunsTable
        runs={[makeRun({ id: 1, status: 'running', finishedAt: null })]}
        runsLoading={false}
        selectedRunId={null}
        onSelectRun={vi.fn()}
        onDeleteRun={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Delete run' })).not.toBeInTheDocument()
  })

  it('shows the delete button for finished runs', () => {
    render(
      <ScheduleRunsTable
        runs={[makeRun({ id: 1, status: 'completed' })]}
        runsLoading={false}
        selectedRunId={null}
        onSelectRun={vi.fn()}
        onDeleteRun={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Delete run' })).toBeInTheDocument()
  })

  it('shows an empty state when there are no runs', () => {
    render(
      <ScheduleRunsTable
        runs={[]}
        runsLoading={false}
        selectedRunId={null}
        onSelectRun={vi.fn()}
      />,
    )

    expect(screen.getByText('No runs yet')).toBeInTheDocument()
  })
})
