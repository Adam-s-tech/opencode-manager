import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ScheduleReportsBell } from './ScheduleReportsBell'

const mocks = vi.hoisted(() => ({
  useUnreadScheduleRuns: vi.fn(),
  useMarkAllScheduleRunsViewed: vi.fn(),
}))

vi.mock('@/hooks/useSchedules', () => ({
  useUnreadScheduleRuns: mocks.useUnreadScheduleRuns,
  useMarkAllScheduleRunsViewed: mocks.useMarkAllScheduleRunsViewed,
}))

vi.mock('@/hooks/useMobile', () => ({
  useMobile: vi.fn(() => false),
}))

function renderBell() {
  return render(
    <MemoryRouter>
      <ScheduleReportsBell />
    </MemoryRouter>,
  )
}

describe('ScheduleReportsBell', () => {
  beforeAll(() => {
    Element.prototype.hasPointerCapture ??= () => false
    Element.prototype.setPointerCapture ??= () => {}
    Element.prototype.releasePointerCapture ??= () => {}
    Element.prototype.scrollIntoView ??= () => {}
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useMarkAllScheduleRunsViewed.mockReturnValue({ mutate: vi.fn(), isPending: false })
  })

  it('renders the unread count badge', () => {
    mocks.useUnreadScheduleRuns.mockReturnValue({ data: { runs: [], total: 3, failed: 0 } })
    renderBell()

    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('uses destructive styling when a run failed', () => {
    mocks.useUnreadScheduleRuns.mockReturnValue({ data: { runs: [], total: 3, failed: 1 } })
    renderBell()

    expect(screen.getByTestId('schedule-reports-count')).toHaveClass('bg-destructive')
  })

  it('shows the all-caught-up empty state when there are no unread runs', async () => {
    const user = userEvent.setup()
    mocks.useUnreadScheduleRuns.mockReturnValue({ data: { runs: [], total: 0, failed: 0 } })
    renderBell()

    await user.click(screen.getByRole('button', { name: 'Reports, 0 unread' }))

    expect(await screen.findByText('All caught up')).toBeInTheDocument()
  })
})
