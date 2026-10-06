import type { ReactNode } from 'react'
import type { ScheduleRunWorktreesMode } from '@opencode-manager/shared/types'
import { Button } from '@/components/ui/button'
import { DeleteDialog } from '@/components/ui/delete-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, Loader2 } from 'lucide-react'

interface ScheduleRunRemovalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  affectedWorktreeCount: number
  isPending: boolean
  onCancel: () => void
  onConfirm: (worktrees?: ScheduleRunWorktreesMode) => void
}

export function ScheduleRunRemovalDialog({
  open,
  onOpenChange,
  title,
  description,
  affectedWorktreeCount,
  isPending,
  onCancel,
  onConfirm,
}: ScheduleRunRemovalDialogProps) {
  if (affectedWorktreeCount === 0) {
    return (
      <DeleteDialog
        open={open}
        onOpenChange={onOpenChange}
        onConfirm={() => onConfirm()}
        onCancel={onCancel}
        title={title}
        description={description}
        isDeleting={isPending}
      />
    )
  }

  const worktreeLabel = `${affectedWorktreeCount} kept worktree${affectedWorktreeCount === 1 ? '' : 's'}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90%] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <Alert className="overflow-hidden">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <AlertDescription className="break-words">
            {worktreeLabel} will be removed. Choose how to handle {affectedWorktreeCount === 1 ? 'it' : 'them'}.
          </AlertDescription>
        </Alert>

        <div className="space-y-2 text-sm">
          <p>
            <span className="font-medium">Commit and remove</span> — pending changes are committed to each run branch, then the worktree folders are removed. The branches are kept.
          </p>
          <p>
            <span className="font-medium">Force delete</span> — the worktree folders are force-removed and their run branches deleted. Any uncommitted changes are lost.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
            className="flex-1 sm:flex-none"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm('discard')}
            disabled={isPending}
            className="flex-1 sm:flex-none"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Force delete
          </Button>
          <Button
            onClick={() => onConfirm('commit')}
            disabled={isPending}
            className="flex-1 sm:flex-none"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Commit and remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
