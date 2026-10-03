import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PromptInput } from './PromptInput'
import { useUIState } from '@/stores/uiStateStore'
import { createCommandActionsMock, stubMatchMedia } from '@/test/test-utils'

const mocks = vi.hoisted(() => ({
  sendPrompt: vi.fn(),
  sendShell: vi.fn(),
  interrupt: vi.fn(),
  startGoal: vi.fn(),
  useSessionGoal: vi.fn(),
  agents: [] as Array<{ id: string; name: string; description?: string; mode?: string; hidden?: boolean }>,
  setAgent: vi.fn(),
  cycleVariant: vi.fn(),
  showToast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    promise: vi.fn(),
    dismiss: vi.fn(),
  },
  useSTT: vi.fn(),
  useMobile: vi.fn(),
  useCommands: vi.fn(),
  useFileSearch: vi.fn(),
  useModelSelection: vi.fn(),
  useVariants: vi.fn(),
  useSessionAgent: vi.fn(),
  useUserBash: vi.fn(),
  useSessionAgentStore: vi.fn(),
  useSendErrorStore: vi.fn(),
}))

vi.mock('@/hooks/useOpenCode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useOpenCode')>()
  return {
    ...actual,
    useSendPrompt: () => ({ mutate: mocks.sendPrompt, isPending: false }),
    useSendShell: () => ({ mutate: mocks.sendShell, isPending: false }),
    useInterruptSession: () => ({ mutate: mocks.interrupt }),
    useAgents: () => ({ data: mocks.agents }),
  }
})

vi.mock('@/hooks/useSessionGoals', () => ({
  useSessionGoal: mocks.useSessionGoal,
  useStartSessionGoal: () => ({ mutateAsync: mocks.startGoal, isPending: false }),
}))

vi.mock('@/hooks/useSTT', () => ({ useSTT: mocks.useSTT }))
vi.mock('@/hooks/useMobile', () => ({ useMobile: mocks.useMobile }))
vi.mock('@/hooks/useCommands', () => ({ useCommands: mocks.useCommands }))
vi.mock('@/hooks/useFileSearch', () => ({ useFileSearch: mocks.useFileSearch }))
vi.mock('@/hooks/useModelSelection', () => ({ useModelSelection: mocks.useModelSelection }))
vi.mock('@/hooks/useVariants', () => ({ useVariants: mocks.useVariants }))
vi.mock('@/hooks/useSessionAgent', () => ({ useSessionAgent: mocks.useSessionAgent }))
vi.mock('@/stores/userBashStore', () => ({ useUserBash: mocks.useUserBash }))
vi.mock('@/stores/sessionAgentStore', () => ({ useSessionAgentStore: mocks.useSessionAgentStore }))
vi.mock('@/stores/sendErrorStore', () => ({ useSendErrorStore: mocks.useSendErrorStore }))
vi.mock('@/lib/toast', () => ({ showToast: mocks.showToast }))

vi.mock('@/contexts/EventContext', () => ({
  usePermissions: () => ({
    hasForSession: vi.fn().mockReturnValue(false),
    setShowDialog: vi.fn(),
  }),
}))

vi.mock('@/components/agent/AgentQuickSelect', () => ({
  AgentQuickSelect: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/model/ModelQuickSelect', () => ({
  ModelQuickSelect: ({ children, open }: { children?: React.ReactNode; open?: boolean }) => (
    <div data-testid="model-quick-select" data-open={open ? 'true' : 'false'}>{children}</div>
  ),
}))

vi.mock('@/components/session/PermissionModeToggle', () => ({
  PermissionModeToggle: () => null,
}))

vi.mock('@/components/ui/session-status-indicator', () => ({
  SessionStatusIndicator: () => <div>SessionStatus</div>,
}))

vi.mock('@/components/command/CommandSuggestions', () => ({
  CommandSuggestions: () => <div>CommandSuggestions</div>,
}))

vi.mock('./MentionSuggestions', () => ({
  MentionSuggestions: () => <div>MentionSuggestions</div>,
}))

const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
})

const GOAL_BUTTON = 'Goal mode: the next message becomes the objective'
const OPEN_GOAL_BUTTON = 'A goal is already active for this session'

describe('PromptInput goal mode', () => {
  const defaultProps = {
    directory: '/test',
    sessionID: 'test-session',
    showScrollButton: false,
    isSessionActive: false,
    isStreamingResponse: false,
    onScrollToBottom: vi.fn(),
    commandActions: createCommandActionsMock(),
    onPromptChange: vi.fn(),
  }

  const renderComponent = () => {
    const queryClient = createTestQueryClient()
    return render(
      <QueryClientProvider client={queryClient}>
        <PromptInput {...defaultProps} />
      </QueryClientProvider>
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useSessionGoal.mockReturnValue({ data: null })
    mocks.startGoal.mockResolvedValue({ id: 1 })
    mocks.agents = []
    mocks.useMobile.mockReturnValue(false)
    mocks.useSTT.mockReturnValue({
      isRecording: false,
      isProcessing: false,
      isSupported: false,
      isEnabled: false,
      interimTranscript: '',
      transcript: '',
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
      abortRecording: vi.fn(),
      clear: vi.fn(),
    })
    mocks.useCommands.mockReturnValue({ filterCommands: () => [] })
    mocks.useFileSearch.mockReturnValue({ files: [] })
    mocks.useModelSelection.mockReturnValue({
      model: { providerID: 'anthropic', modelID: 'claude-sonnet-4' },
      modelString: 'anthropic/claude-sonnet-4',
      setModel: vi.fn(),
      setActiveModel: vi.fn(),
      recentModels: [],
      favoriteModels: [],
      toggleFavorite: vi.fn(),
      isModelStateLoading: false,
    })
    mocks.useVariants.mockReturnValue({ hasVariants: false, currentVariant: null, cycleVariant: mocks.cycleVariant })
    mocks.useSessionAgent.mockReturnValue({ agent: 'build' })
    mocks.useUserBash.mockImplementation((selector: (state: unknown) => unknown) => selector({ addUserBashCommand: vi.fn() }))
    mocks.useSessionAgentStore.mockImplementation((selector: (state: unknown) => unknown) => selector({ setAgent: mocks.setAgent }))
    mocks.useSendErrorStore.mockImplementation((selector: (state: unknown) => unknown) => selector({ errors: {} }))
    useUIState.getState().clearPendingPromptCommand()
    useUIState.getState().clearPendingPromptFile()
  })

  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia')
  })

  it('starts a goal with the message objective before sending it', async () => {
    stubMatchMedia(true)
    renderComponent()

    const input = await screen.findByPlaceholderText('Send a message...')
    fireEvent.change(input, { target: { value: 'Ship the feature' } })
    fireEvent.click(screen.getByRole('button', { name: GOAL_BUTTON }))
    fireEvent.click(screen.getByTitle('Send'))

    await waitFor(() => expect(mocks.startGoal).toHaveBeenCalledWith({
      sessionId: 'test-session',
      directory: '/test',
      objective: 'Ship the feature',
    }))
    await waitFor(() => expect(mocks.sendPrompt).toHaveBeenCalled())
    expect(mocks.startGoal.mock.invocationCallOrder[0]).toBeLessThan(mocks.sendPrompt.mock.invocationCallOrder[0])
  })

  it('does not send the message when starting the goal is rejected', async () => {
    stubMatchMedia(true)
    mocks.startGoal.mockRejectedValue(new Error('This session already has an open goal'))
    renderComponent()

    const input = await screen.findByPlaceholderText('Send a message...')
    fireEvent.change(input, { target: { value: 'Ship the feature' } })
    fireEvent.click(screen.getByRole('button', { name: GOAL_BUTTON }))
    fireEvent.click(screen.getByTitle('Send'))

    await waitFor(() => expect(mocks.startGoal).toHaveBeenCalled())
    expect(mocks.sendPrompt).not.toHaveBeenCalled()
  })

  it('does not start a goal when the mode was not armed', async () => {
    stubMatchMedia(true)
    renderComponent()

    const input = await screen.findByPlaceholderText('Send a message...')
    fireEvent.change(input, { target: { value: 'Just a message' } })
    fireEvent.click(screen.getByTitle('Send'))

    await waitFor(() => expect(mocks.sendPrompt).toHaveBeenCalled())
    expect(mocks.startGoal).not.toHaveBeenCalled()
  })

  it('disables goal mode while a goal is already active', async () => {
    stubMatchMedia(true)
    mocks.useSessionGoal.mockReturnValue({ data: { status: 'active' } })
    renderComponent()

    const button = await screen.findByRole('button', { name: OPEN_GOAL_BUTTON })
    expect(button).toBeDisabled()
  })
})
