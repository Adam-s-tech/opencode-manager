import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Repo } from '@/api/types'
import { CreateWorktreeDialog } from './CreateWorktreeDialog'

const mocks = vi.hoisted(() => ({
  createRepo: vi.fn(),
  listBranches: vi.fn(),
  navigate: vi.fn(),
  showToastSuccess: vi.fn(),
  showToastInfo: vi.fn(),
  showToastWarning: vi.fn(),
  invalidateRepoGitCaches: vi.fn(),
}))

vi.mock('@/api/repos', () => ({
  createRepo: mocks.createRepo,
  listBranches: mocks.listBranches,
}))

vi.mock('@/lib/toast', () => ({
  showToast: {
    success: mocks.showToastSuccess,
    info: mocks.showToastInfo,
    warning: mocks.showToastWarning,
    error: vi.fn(),
  },
}))

vi.mock('@/lib/queryInvalidation', () => ({
  invalidateRepoGitCaches: mocks.invalidateRepoGitCaches,
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  }
})

function createWorktreeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 42,
    localPath: 'repos/feature-x',
    fullPath: '/tmp/repos/feature-x',
    defaultBranch: 'main',
    cloneStatus: 'ready',
    clonedAt: 1,
    ...overrides,
  }
}

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CreateWorktreeDialog
        open
        onOpenChange={() => {}}
        repoId={1}
        repoUrl="https://github.com/test/repo"
        defaultBaseBranch="main"
      />
    </QueryClientProvider>,
  )
}

async function submitCreate() {
  const user = userEvent.setup()
  await user.type(screen.getByPlaceholderText('feature/my-branch'), 'feature/x')
  await user.click(screen.getByRole('button', { name: 'Create Worktree' }))
}

describe('CreateWorktreeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listBranches.mockResolvedValue({
      branches: [{ name: 'main', type: 'local', current: true }],
      status: { ahead: 0, behind: 0 },
    })
  })

  it('navigates to the setup terminal when the worktree setup starts', async () => {
    mocks.createRepo.mockResolvedValue(
      createWorktreeRepo({
        worktreeSetup: {
          status: 'started',
          terminal: {
            id: 'pty-1',
            title: 'Worktree setup',
            kind: 'setup',
            cwd: '/tmp/repos/feature-x',
            status: 'running',
          },
          repoCommandsSkipped: false,
        },
      }),
    )

    renderDialog()
    await submitCreate()

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith('/repos/42?dialog=terminal&terminal=pty-1'),
    )
  })

  it('warns without navigating when the worktree setup fails', async () => {
    mocks.createRepo.mockResolvedValue(
      createWorktreeRepo({ worktreeSetup: { status: 'failed', error: 'spawn failed' } }),
    )

    renderDialog()
    await submitCreate()

    await waitFor(() => expect(mocks.showToastWarning).toHaveBeenCalled())
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('informs about skipped repository commands when the setup is skipped', async () => {
    mocks.createRepo.mockResolvedValue(
      createWorktreeRepo({ worktreeSetup: { status: 'skipped', reason: 'untrusted' } }),
    )

    renderDialog()
    await submitCreate()

    await waitFor(() =>
      expect(mocks.showToastInfo).toHaveBeenCalledWith(
        'Repository setup commands were skipped until trusted in Actions',
      ),
    )
    expect(mocks.navigate).not.toHaveBeenCalled()
  })
})
