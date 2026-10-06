import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScheduleRunRemovalDialog } from './ScheduleRunRemovalDialog'

type DialogProps = Parameters<typeof ScheduleRunRemovalDialog>[0]

function renderDialog(overrides: Partial<DialogProps> = {}) {
  const props: DialogProps = {
    open: true,
    onOpenChange: vi.fn(),
    title: 'Delete run',
    description: 'This permanently deletes this run.',
    affectedWorktreeCount: 0,
    isPending: false,
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  }
  render(<ScheduleRunRemovalDialog {...props} />)
  return props
}

describe('ScheduleRunRemovalDialog', () => {
  it('confirms without a worktrees mode when no kept worktree is affected', async () => {
    const user = userEvent.setup()
    const props = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(props.onConfirm).toHaveBeenCalledWith()
  })

  it('offers commit and force delete when kept worktrees are affected', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    renderDialog({ affectedWorktreeCount: 2, onConfirm })

    expect(screen.getByText(/2 kept worktrees will be removed/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Commit and remove' }))
    expect(onConfirm).toHaveBeenCalledWith('commit')

    await user.click(screen.getByRole('button', { name: 'Force delete' }))
    expect(onConfirm).toHaveBeenCalledWith('discard')
  })
})
