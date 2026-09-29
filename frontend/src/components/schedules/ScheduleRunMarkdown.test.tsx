import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ScheduleRunMarkdown } from './ScheduleRunMarkdown'

describe('ScheduleRunMarkdown links', () => {
  it('opens local file links through the callback instead of navigating', () => {
    const onOpenLocalPath = vi.fn()
    render(<ScheduleRunMarkdown content="[Report](recaps/daily.html)" onOpenLocalPath={onOpenLocalPath} />)

    const link = screen.getByRole('link', { name: 'Report' })
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    fireEvent(link, event)

    expect(event.defaultPrevented).toBe(true)
    expect(onOpenLocalPath).toHaveBeenCalledWith('recaps/daily.html')
  })

  it('opens external links in a new tab', () => {
    render(<ScheduleRunMarkdown content="[Docs](https://example.com)" onOpenLocalPath={vi.fn()} />)

    const link = screen.getByRole('link', { name: 'Docs' })
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })
})
