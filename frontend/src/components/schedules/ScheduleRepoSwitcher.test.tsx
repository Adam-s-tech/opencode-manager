import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ScheduleRepoSwitcher } from './ScheduleRepoSwitcher'
import { listRepos } from '@/api/repos'
import { ASSISTANT_REPO_ID } from '@opencode-manager/shared/utils'

const mobileState = { current: false }

vi.mock('@/hooks/useMobile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useMobile')>()
  return { ...actual, useMobile: () => mobileState.current }
})

vi.mock('@/api/repos')

function createRepo(id: number, name: string) {
  return {
    id,
    name,
    repoUrl: `https://github.com/test/${name}.git`,
    localPath: `${name}-path`,
    fullPath: `/repos/${name}-path`,
    sourcePath: null,
    currentBranch: 'main',
    defaultBranch: 'main',
    cloneStatus: 'ready' as const,
    clonedAt: 0,
    lastAccessedAt: 0,
    isLocal: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function LocationSpy() {
  const { pathname } = useLocation()
  return <div data-testid="location">{pathname}</div>
}

function renderSwitcher(repoId: number | undefined, name: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/repos/1/schedules']}>
        <ScheduleRepoSwitcher repoId={repoId} name={name} />
        <LocationSpy />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ScheduleRepoSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mobileState.current = false
    vi.mocked(listRepos).mockResolvedValue([
      createRepo(1, 'repo1'),
      createRepo(2, 'repo2'),
      createRepo(ASSISTANT_REPO_ID, 'Assistant'),
    ])
  })

  it('shows the current repository and switches to another repo (desktop)', async () => {
    const user = userEvent.setup()
    renderSwitcher(1, 'repo1')

    await user.click(screen.getByRole('button', { name: 'Switch repository (repo1)' }))

    await waitFor(() => expect(screen.getByText('All repos')).toBeInTheDocument())
    expect(screen.getByText('repo2')).toBeInTheDocument()

    await user.click(screen.getByText('repo2'))

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/repos/2/schedules'))
  })

  it('switches to all repos', async () => {
    const user = userEvent.setup()
    renderSwitcher(1, 'repo1')

    await user.click(screen.getByRole('button', { name: 'Switch repository (repo1)' }))
    await waitFor(() => expect(screen.getByText('All repos')).toBeInTheDocument())

    await user.click(screen.getByText('All repos'))

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/schedules'))
  })

  it('marks the current repository as active', async () => {
    const user = userEvent.setup()
    renderSwitcher(1, 'repo1')

    await user.click(screen.getByRole('button', { name: 'Switch repository (repo1)' }))
    const menu = await screen.findByRole('menu')

    expect(within(menu).getByText('repo1').closest('[aria-current="true"]')).not.toBeNull()
    expect(within(menu).getByText('repo2').closest('[aria-current="true"]')).toBeNull()
  })

  it('navigates to the assistant schedules for repo 0', async () => {
    const user = userEvent.setup()
    renderSwitcher(ASSISTANT_REPO_ID, 'Assistant')

    await user.click(screen.getByRole('button', { name: 'Switch repository (Assistant)' }))
    await waitFor(() => expect(screen.getByText('repo2')).toBeInTheDocument())

    await user.click(screen.getByText('repo2'))

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/repos/2/schedules'))
  })

  it('filters repositories by search on mobile', async () => {
    mobileState.current = true
    renderSwitcher(1, 'repo1')

    fireEvent.click(screen.getByRole('button', { name: 'Switch repository (repo1)' }))

    const search = await screen.findByPlaceholderText('Search repositories...')
    fireEvent.change(search, { target: { value: 'repo2' } })

    const sheet = screen.getByRole('dialog', { name: 'Switch repository' })
    await waitFor(() => {
      expect(within(sheet).getByText('repo2')).toBeInTheDocument()
      expect(within(sheet).queryByText('repo1')).not.toBeInTheDocument()
    })
  })

  it('switches repositories from the mobile sheet', async () => {
    mobileState.current = true
    renderSwitcher(1, 'repo1')

    fireEvent.click(screen.getByRole('button', { name: 'Switch repository (repo1)' }))
    await screen.findByPlaceholderText('Search repositories...')
    await waitFor(() => expect(screen.getByText('repo2')).toBeInTheDocument())

    fireEvent.click(screen.getByText('repo2'))

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/repos/2/schedules'))
  })
})
