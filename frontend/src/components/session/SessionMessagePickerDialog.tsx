import { useEffect, useMemo, useState } from 'react'
import type { SessionMessageInfo } from '@opencode-manager/shared/opencode'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

const MESSAGE_PREVIEW_MAX_LENGTH = 200

interface SessionMessagePickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  messages: SessionMessageInfo[]
  leadingOptionLabel?: string
  loading?: boolean
  onSelect: (messageID: string | undefined) => void
}

function messagePreview(text: string): string {
  const singleLine = text.replace(/\s+/g, ' ').trim()
  return singleLine.length > MESSAGE_PREVIEW_MAX_LENGTH
    ? singleLine.slice(0, MESSAGE_PREVIEW_MAX_LENGTH)
    : singleLine
}

export function SessionMessagePickerDialog({
  open,
  onOpenChange,
  title,
  messages,
  leadingOptionLabel,
  loading = false,
  onSelect,
}: SessionMessagePickerDialogProps) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  const items = useMemo(() => {
    const userMessages = messages.filter(
      (message): message is Extract<SessionMessageInfo, { type: 'user' }> =>
        message.type === 'user' && message.text.trim().length > 0,
    )
    const normalizedQuery = query.trim().toLowerCase()
    const filtered = normalizedQuery
      ? userMessages.filter((message) => message.text.toLowerCase().includes(normalizedQuery))
      : userMessages
    return [...filtered].reverse()
  }, [messages, query])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>{title}</DialogTitle>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search messages"
          autoFocus
          className="mt-4"
        />
        <div className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto mt-4">
          {leadingOptionLabel && (
            <button
              type="button"
              onClick={() => onSelect(undefined)}
              className="w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-accent"
            >
              {leadingOptionLabel}
            </button>
          )}
          {loading ? (
            <span className="px-3 py-2 text-sm text-muted-foreground">Loading messages…</span>
          ) : (
            <>
              {items.map((message) => (
                <button
                  key={message.id}
                  type="button"
                  onClick={() => onSelect(message.id)}
                  className="w-full rounded-md border border-border px-3 py-2 text-left hover:bg-accent"
                >
                  <span className="block text-sm truncate">{messagePreview(message.text)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {new Date(message.time.created).toLocaleTimeString([], { timeStyle: 'short' })}
                  </span>
                </button>
              ))}
              {items.length === 0 && (
                <span className="px-3 py-2 text-sm text-muted-foreground">No messages</span>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
