import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Combobox } from './combobox'

const options = [
  { value: 'builtin', label: 'Built-in Browser' },
  { value: 'external', label: 'External API' },
]

function renderCombobox(onOpen = vi.fn()) {
  render(
    <div>
      <Combobox value="builtin" onChange={vi.fn()} options={options} allowCustomValue={false} ariaLabel="Provider" onOpen={onOpen} />
      <button type="button">Outside</button>
    </div>,
  )
  return screen.getByRole('combobox', { name: 'Provider' })
}

describe('Combobox', () => {
  it('restores the selected label, not the raw value, on Escape', async () => {
    const user = userEvent.setup()
    const input = renderCombobox()

    await user.clear(input)
    await user.type(input, 'Ext')
    await user.keyboard('{Escape}')

    expect(input).toHaveValue('Built-in Browser')
  })

  it('restores the selected label, not the raw value, on an outside click', async () => {
    const user = userEvent.setup()
    const input = renderCombobox()

    await user.clear(input)
    await user.type(input, 'Ext')
    await user.click(screen.getByRole('button', { name: 'Outside' }))

    expect(input).toHaveValue('Built-in Browser')
  })

  it('filters options as the user types', async () => {
    const user = userEvent.setup()
    const input = renderCombobox()

    await user.clear(input)
    await user.type(input, 'ext')

    expect(screen.getByRole('option', { name: 'External API' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Built-in Browser' })).not.toBeInTheDocument()
  })

  it('calls onOpen each time the options open', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    const input = renderCombobox(onOpen)

    await user.click(input)
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Outside' }))
    await user.click(input)

    expect(onOpen).toHaveBeenCalledTimes(2)
  })
})
