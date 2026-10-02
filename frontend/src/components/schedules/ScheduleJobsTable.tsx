import type { MouseEvent } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Loader2, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { formatScheduleShortLabel, formatScheduleSummary } from './schedule-utils'
import type { ScheduleJobWithRepo, ScheduleRunSummary } from '@/api/schedules'

interface ScheduleJobsTableProps {
  jobs: ScheduleJobWithRepo[]
  showRepo: boolean
  selectedJobId?: number | null
  onOpen: (job: ScheduleJobWithRepo) => void
  onRunNow?: (job: ScheduleJobWithRepo) => void
  onToggleEnabled?: (job: ScheduleJobWithRepo) => void
  onEdit?: (job: ScheduleJobWithRepo) => void
  onDelete?: (job: ScheduleJobWithRepo) => void
  onCancelRun?: (job: ScheduleJobWithRepo) => void
  onOpenJob?: (job: ScheduleJobWithRepo) => void
  onNavigateToRepo?: (repoPath: string) => void
  runPending?: boolean
  cancelPending?: boolean
}

function isUnreadRun(lastRun: ScheduleRunSummary): boolean {
  return lastRun.viewedAt === null && (lastRun.status === 'completed' || lastRun.status === 'failed')
}

function ScheduleJobNewPill() {
  return (
    <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
      NEW
    </span>
  )
}

function ScheduleJobStatusIndicator({ job }: { job: ScheduleJobWithRepo }) {
  const status = job.lastRun?.status

  if (status === 'running') {
    return <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin text-primary" />
  }

  if (status === 'completed') {
    return <span aria-hidden="true" className="h-2 w-2 rounded-full bg-success" />
  }

  if (status === 'failed') {
    return <span aria-hidden="true" className="h-2 w-2 rounded-full bg-destructive" />
  }

  return <span aria-hidden="true" className="h-2 w-2 rounded-full border border-muted-foreground/50" />
}

function ScheduleJobLastResult({ lastRun }: { lastRun: ScheduleRunSummary | null }) {
  if (!lastRun) {
    return <span className="text-muted-foreground">No runs yet</span>
  }

  if (lastRun.status === 'running') {
    return <span className="text-muted-foreground">Running · {formatDistanceToNow(lastRun.startedAt)}</span>
  }

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 text-muted-foreground">
        {formatDistanceToNow(lastRun.finishedAt ?? lastRun.startedAt, { addSuffix: true })}
      </span>
      {isUnreadRun(lastRun) && <ScheduleJobNewPill />}
      {lastRun.preview && (
        <span className={cn('hidden truncate sm:inline', lastRun.status === 'failed' ? 'text-destructive/80' : 'text-muted-foreground')}>
          {lastRun.preview}
        </span>
      )}
    </span>
  )
}

export function ScheduleJobsTable({
  jobs,
  showRepo,
  selectedJobId = null,
  onOpen,
  onRunNow,
  onToggleEnabled,
  onEdit,
  onDelete,
  onCancelRun,
  onOpenJob,
  onNavigateToRepo,
  runPending = false,
  cancelPending = false,
}: ScheduleJobsTableProps) {
  const runAction = (action: ((target: ScheduleJobWithRepo) => void) | undefined, job: ScheduleJobWithRepo) => (event: MouseEvent) => {
    event.stopPropagation()
    action?.(job)
  }

  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 z-10 whitespace-nowrap bg-background text-xs uppercase text-muted-foreground">
        <tr className="border-b border-border/60">
          <th scope="col" className="px-3 py-2.5 text-left font-medium">Status</th>
          <th scope="col" className="px-3 py-2.5 text-left font-medium">Job</th>
          {showRepo && <th scope="col" className="hidden px-3 py-2.5 text-left font-medium sm:table-cell">Repo</th>}
          <th scope="col" className="hidden px-3 py-2.5 text-left font-medium sm:table-cell">Schedule</th>
          <th scope="col" className="hidden px-3 py-2.5 text-left font-medium sm:table-cell">Next run</th>
          <th scope="col" className="hidden px-3 py-2.5 text-left font-medium sm:table-cell">Last result</th>
          <th scope="col" className="w-px px-3 py-2.5 text-right font-medium">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/60">
        {jobs.map((job) => {
          const lastRun = job.lastRun
          const isRunning = lastRun?.status === 'running'
          const isPaused = !job.enabled
          const isSelected = selectedJobId === job.id
          const statusLabel = isRunning ? 'Running' : isPaused ? 'Paused' : 'Active'
          const nextRunLabel = !job.enabled || !job.nextRunAt
            ? '—'
            : job.nextRunAt <= Date.now()
              ? 'Due now'
              : formatDistanceToNow(job.nextRunAt, { addSuffix: true })
          const nextRunTitle = job.enabled && job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : undefined
          const scheduleLabel = formatScheduleShortLabel(job)
          const scheduleTitle = formatScheduleSummary(job)
          const mobileDetail = showRepo ? `${job.repoName} · ${scheduleLabel}` : scheduleLabel

          const showRunNow = Boolean(onRunNow) && !isRunning
          const hasMenu = showRunNow || Boolean(onToggleEnabled) || Boolean(onEdit) || Boolean(onOpenJob) || Boolean(onDelete)

          const contextualAction = isRunning && onCancelRun ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={runAction(onCancelRun, job)}
              disabled={cancelPending}
            >
              Cancel
            </Button>
          ) : isPaused && onToggleEnabled ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={runAction(onToggleEnabled, job)}
            >
              Resume
            </Button>
          ) : null

          return (
            <tr
              key={job.id}
              onClick={() => onOpen(job)}
              className={cn(
                'cursor-pointer transition-colors hover:bg-accent/40',
                isPaused && 'opacity-60',
                isSelected && 'bg-accent/30',
              )}
            >
              <td className="px-3 py-2.5">
                <span className="flex items-center gap-2">
                  <ScheduleJobStatusIndicator job={job} />
                  <span className="hidden text-xs text-muted-foreground sm:inline">{statusLabel}</span>
                </span>
              </td>
              <td className="px-3 py-2.5">
                <div className="flex min-w-0 flex-col">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpen(job)
                    }}
                    aria-label={`Open ${job.name}`}
                    className="max-w-[11rem] truncate font-medium sm:max-w-[20rem] rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    {job.name}
                  </button>
                  {job.description && <span className="max-w-[11rem] truncate text-xs text-muted-foreground sm:max-w-[20rem]">{job.description}</span>}
                  <span className="max-w-[11rem] truncate text-xs text-muted-foreground sm:hidden" title={scheduleTitle}>{mobileDetail}</span>
                  <span className="mt-0.5 text-xs sm:hidden">
                    <ScheduleJobLastResult lastRun={lastRun} />
                  </span>
                </div>
              </td>
              {showRepo && (
                <td className="hidden px-3 py-2.5 sm:table-cell">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onNavigateToRepo?.(job.repoPath)
                    }}
                    className="max-w-[16rem] truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {job.repoName}
                  </button>
                </td>
              )}
              <td className="hidden px-3 py-2.5 sm:table-cell">
                <span className="block truncate text-muted-foreground" title={scheduleTitle}>{scheduleLabel}</span>
              </td>
              <td className="hidden px-3 py-2.5 sm:table-cell">
                <span className="block truncate text-muted-foreground" title={nextRunTitle}>{nextRunLabel}</span>
              </td>
              <td className="hidden max-w-[16rem] px-3 py-2.5 sm:table-cell">
                <ScheduleJobLastResult lastRun={lastRun} />
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center justify-end gap-1">
                  {contextualAction}
                  {hasMenu && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="More actions"
                          className="h-7 w-7 text-muted-foreground"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                        {showRunNow && onRunNow && (
                          <DropdownMenuItem disabled={runPending} onClick={runAction(onRunNow, job)}>Run now</DropdownMenuItem>
                        )}
                        {onToggleEnabled && (
                          <DropdownMenuItem onClick={runAction(onToggleEnabled, job)}>
                            {job.enabled ? 'Pause' : 'Resume'}
                          </DropdownMenuItem>
                        )}
                        {onEdit && <DropdownMenuItem onClick={runAction(onEdit, job)}>Edit</DropdownMenuItem>}
                        {onOpenJob && <DropdownMenuItem onClick={runAction(onOpenJob, job)}>Open job</DropdownMenuItem>}
                        {onDelete && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={runAction(onDelete, job)}>
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
