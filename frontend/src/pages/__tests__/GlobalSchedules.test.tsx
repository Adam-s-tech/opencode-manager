import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GlobalSchedules } from '../GlobalSchedules'

const mocks = vi.hoisted(() => ({
  useAllSchedules: vi.fn(),
  useAllScheduleRuns: vi.fn(),
  useCreateRepoSchedule: vi.fn(),
  useUpdateRepoSchedule: vi.fn(),
  useDeleteRepoSchedule: vi.fn(),
  useRunRepoSchedule: vi.fn(),
  useCancelRepoScheduleRun: vi.fn(),
  useScheduleUrlState: vi.fn(),
  RunHistoryCards: vi.fn(() => null),
}))

vi.mock('@/hooks/useSchedules', () => ({
  useAllSchedules: mocks.useAllSchedules,
  useAllScheduleRuns: mocks.useAllScheduleRuns,
  useCreateRepoSchedule: mocks.useCreateRepoSchedule,
  useUpdateRepoSchedule: mocks.useUpdateRepoSchedule,
  useDeleteRepoSchedule: mocks.useDeleteRepoSchedule,
  useRunRepoSchedule: mocks.useRunRepoSchedule,
  useCancelRepoScheduleRun: mocks.useCancelRepoScheduleRun,
}))

vi.mock('@/hooks/useScheduleUrlState', () => ({
  useScheduleUrlState: mocks.useScheduleUrlState,
}))

vi.mock('@/components/schedules', () => ({
  ScheduleJobDialog: vi.fn(() => null),
  RunHistoryCards: mocks.RunHistoryCards,
  PromptsTab: vi.fn(() => null),
}))

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    jobId: 7,
    repoId: 42,
    triggerSource: 'manual',
    status: 'completed',
    startedAt: Date.UTC(2026, 2, 9, 12, 0, 0),
    finishedAt: Date.UTC(2026, 2, 9, 12, 5, 0),
    createdAt: Date.UTC(2026, 2, 9, 12, 0, 0),
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

function createMockScheduleUrlState(overrides: Record<string, unknown> = {}) {
  return {
    scheduleTab: 'runs',
    setScheduleTab: vi.fn(),
    dialog: null,
    promptDialog: null,
    jobId: null,
    runId: null,
    templateId: null,
    openNewJob: vi.fn(),
    openEditJob: vi.fn(),
    openDeleteJob: vi.fn(),
    openNewTemplate: vi.fn(),
    openEditTemplate: vi.fn(),
    openDeleteTemplate: vi.fn(),
    openImportTemplate: vi.fn(),
    closeDialog: vi.fn(),
    closePromptDialog: vi.fn(),
    selectRun: vi.fn(),
    selectJobAndView: vi.fn(),
    selectJobAndCloseDialog: vi.fn(),
    replaceUrlParams: vi.fn(),
    ...overrides,
  }
}

let mainRunsResult: { data: unknown; isLoading: boolean; isError?: boolean }
let selectedRunResult: { data: unknown; isLoading: boolean; isError?: boolean; refetch?: () => void }

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

const renderGlobalSchedules = () => {
  return render(
    <MemoryRouter initialEntries={['/schedules']}>
      <GlobalSchedules />
    </MemoryRouter>,
    { wrapper: createWrapper() }
  )
}

const runHistoryProps = () => mocks.RunHistoryCards.mock.calls.at(-1)?.[0] as {
  runs: Array<{ id: number }>
  selectedRunId: number | null
}

describe('GlobalSchedules run history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mainRunsResult = { data: [], isLoading: false }
    selectedRunResult = { data: undefined, isLoading: false, isError: false }

    mocks.useAllScheduleRuns.mockImplementation((params: { limit?: number }) =>
      params.limit === 1 ? selectedRunResult : mainRunsResult
    )
    mocks.useAllSchedules.mockReturnValue({ data: [], isLoading: false, error: null })
    mocks.useCreateRepoSchedule.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mocks.useUpdateRepoSchedule.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mocks.useDeleteRepoSchedule.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mocks.useRunRepoSchedule.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mocks.useCancelRepoScheduleRun.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mocks.useScheduleUrlState.mockReturnValue(createMockScheduleUrlState())
  })

  it('loads and pins a selected run outside the loaded history', () => {
    const historyRuns = Array.from({ length: 50 }, (_, index) => makeRun({ id: index + 1, sessionTitle: `Run ${index + 1}` }))
    mainRunsResult = { data: historyRuns, isLoading: false }
    selectedRunResult = { data: [makeRun({ id: 999, sessionTitle: 'Deep linked run' })], isLoading: false, isError: false }
    mocks.useScheduleUrlState.mockReturnValue(createMockScheduleUrlState({ scheduleTab: 'runs', runId: 999 }))

    renderGlobalSchedules()

    expect(mocks.useAllScheduleRuns).toHaveBeenCalledWith({ limit: 1, runId: 999 }, true)
    const props = runHistoryProps()
    expect(props.selectedRunId).toBe(999)
    expect(props.runs.some((run) => run.id === 999)).toBe(true)
    expect(screen.queryByText('No runs found')).not.toBeInTheDocument()
  })

  it('does not duplicate a selected run already present in history', () => {
    mainRunsResult = { data: [makeRun({ id: 5 }), makeRun({ id: 6 })], isLoading: false }
    mocks.useScheduleUrlState.mockReturnValue(createMockScheduleUrlState({ scheduleTab: 'runs', runId: 5 }))

    renderGlobalSchedules()

    expect(mocks.useAllScheduleRuns).toHaveBeenCalledWith({ limit: 1, runId: 5 }, false)
    const props = runHistoryProps()
    expect(props.runs.filter((run) => run.id === 5)).toHaveLength(1)
  })

  it('shows loading instead of no runs while the selected run lookup is pending', () => {
    selectedRunResult = { data: undefined, isLoading: true, isError: false }
    mocks.useScheduleUrlState.mockReturnValue(createMockScheduleUrlState({ scheduleTab: 'runs', runId: 999 }))

    const { container } = renderGlobalSchedules()

    expect(screen.queryByText('No runs found')).not.toBeInTheDocument()
    expect(container.querySelector('.animate-spin')).not.toBeNull()
    expect(mocks.RunHistoryCards).not.toHaveBeenCalled()
  })

  it('shows run not found when the selected run lookup returns empty', () => {
    selectedRunResult = { data: [], isLoading: false, isError: false }
    const selectRun = vi.fn()
    mocks.useScheduleUrlState.mockReturnValue(createMockScheduleUrlState({ scheduleTab: 'runs', runId: 999, selectRun }))

    renderGlobalSchedules()

    expect(screen.getByText('Run not found')).toBeInTheDocument()
    expect(screen.queryByText('No runs found')).not.toBeInTheDocument()
    expect(mocks.RunHistoryCards).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Back to run history' }))

    expect(selectRun).toHaveBeenCalledWith(null)
  })

  it('shows an error with retry and back actions when the selected run lookup fails', () => {
    const refetch = vi.fn()
    selectedRunResult = { data: undefined, isLoading: false, isError: true, refetch }
    const selectRun = vi.fn()
    mocks.useScheduleUrlState.mockReturnValue(createMockScheduleUrlState({ scheduleTab: 'runs', runId: 999, selectRun }))

    renderGlobalSchedules()

    expect(screen.getByText('Failed to load run')).toBeInTheDocument()
    expect(screen.queryByText('No runs found')).not.toBeInTheDocument()
    expect(mocks.RunHistoryCards).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Back to run history' }))
    expect(selectRun).toHaveBeenCalledWith(null)
  })

  it('re-queries when the selected run id changes', () => {
    mainRunsResult = { data: [], isLoading: false }
    selectedRunResult = { data: [makeRun({ id: 999 })], isLoading: false, isError: false }
    mocks.useScheduleUrlState.mockReturnValue(createMockScheduleUrlState({ scheduleTab: 'runs', runId: 999 }))

    const { rerender } = renderGlobalSchedules()

    expect(mocks.useAllScheduleRuns).toHaveBeenCalledWith({ limit: 1, runId: 999 }, true)

    selectedRunResult = { data: [makeRun({ id: 1000 })], isLoading: false, isError: false }
    mocks.useScheduleUrlState.mockReturnValue(createMockScheduleUrlState({ scheduleTab: 'runs', runId: 1000 }))

    rerender(
      <MemoryRouter initialEntries={['/schedules']}>
        <GlobalSchedules />
      </MemoryRouter>
    )

    expect(mocks.useAllScheduleRuns).toHaveBeenCalledWith({ limit: 1, runId: 1000 }, true)
    expect(runHistoryProps().runs.some((run) => run.id === 1000)).toBe(true)
  })

  it('ignores cached selected run data when the selection is cleared', () => {
    mainRunsResult = { data: [], isLoading: false }
    selectedRunResult = { data: [makeRun({ id: 999, sessionTitle: 'Deep linked run' })], isLoading: false, isError: false }
    mocks.useScheduleUrlState.mockReturnValue(createMockScheduleUrlState({ scheduleTab: 'runs', runId: 999 }))

    const { rerender } = renderGlobalSchedules()

    expect(runHistoryProps().runs.some((run) => run.id === 999)).toBe(true)

    mocks.RunHistoryCards.mockClear()
    mocks.useScheduleUrlState.mockReturnValue(createMockScheduleUrlState({ scheduleTab: 'runs', runId: null }))

    rerender(
      <MemoryRouter initialEntries={['/schedules']}>
        <GlobalSchedules />
      </MemoryRouter>
    )

    expect(screen.getByText('No runs found')).toBeInTheDocument()
    expect(mocks.RunHistoryCards).not.toHaveBeenCalled()
  })

  it('does not query the selected run when the runs tab is inactive', () => {
    mocks.useScheduleUrlState.mockReturnValue(createMockScheduleUrlState({ scheduleTab: 'jobs', runId: 999 }))

    renderGlobalSchedules()

    expect(mocks.useAllScheduleRuns).toHaveBeenCalledWith({ limit: 1, runId: 999 }, false)
  })
})
