import { formatDistanceToNow } from 'date-fns'
import { History, Loader2, Trash2 } from 'lucide-react'
import { formatRunDuration } from '@/components/schedules/schedule-utils'
import { cn } from '@/lib/utils'
import { formatRunBranch, getRunRepoName, getRunStatusIcon, getRunStatusLabel, getRunTitle, type ScheduleRunRow } from './schedule-run-display'

interface ScheduleRunsTableProps {
  runs: ScheduleRunRow[]
  runsLoading: boolean
  selectedRunId: number | null
  onSelectRun: (id: number) => void
  onDeleteRun?: (runId: number) => void
  deleteRunPending?: boolean
  isFiltered?: boolean
}

export function ScheduleRunsTable({
  runs,
  runsLoading,
  selectedRunId,
  onSelectRun,
  onDeleteRun,
  deleteRunPending = false,
  isFiltered = false,
}: ScheduleRunsTableProps) {
  const showRepo = runs.some((run) => getRunRepoName(run) !== null)

  if (runsLoading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!runs.length) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="text-center">
          <History className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium">{isFiltered ? 'No matching runs' : 'No runs yet'}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isFiltered ? 'Try a different search or clear the filters.' : 'Use Run now to generate the first execution record and log bundle.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 z-10 whitespace-nowrap bg-background text-xs uppercase text-muted-foreground">
        <tr className="border-b border-border/60">
          <th scope="col" className="px-3 py-2.5 text-left font-medium">Status</th>
          <th scope="col" className="px-3 py-2.5 text-left font-medium">Run</th>
          {showRepo && <th scope="col" className="hidden px-3 py-2.5 text-left font-medium sm:table-cell">Repo</th>}
          <th scope="col" className="hidden px-3 py-2.5 text-left font-medium sm:table-cell">Trigger</th>
          <th scope="col" className="px-3 py-2.5 text-left font-medium">Started</th>
          <th scope="col" className="hidden px-3 py-2.5 text-left font-medium sm:table-cell">Duration</th>
          <th scope="col" className="hidden px-3 py-2.5 text-left font-medium sm:table-cell">Branch</th>
          <th scope="col" className="w-px px-3 py-2.5 text-right font-medium">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/60">
        {runs.map((run) => {
          const isUnread = run.viewedAt === null && (run.status === 'completed' || run.status === 'failed')
          const isSelected = selectedRunId === run.id
          const startedAt = run.finishedAt ?? run.startedAt
          const repoName = getRunRepoName(run)

          return (
            <tr
              key={run.id}
              tabIndex={0}
              onClick={() => onSelectRun(run.id)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelectRun(run.id)
                }
              }}
              className={cn('cursor-pointer transition-colors hover:bg-accent/40', isSelected && 'bg-accent/30')}
            >
              <td className="px-3 py-2.5">
                <span className="flex items-center gap-2">
                  {getRunStatusIcon(run.status)}
                  <span className="hidden text-xs text-muted-foreground sm:inline">{getRunStatusLabel(run.status)}</span>
                </span>
              </td>
              <td className="px-3 py-2.5">
                <div className="flex min-w-0 flex-col">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn('truncate', isUnread ? 'font-semibold' : 'font-medium')}>{getRunTitle(run)}</span>
                    {isUnread && (
                      <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">NEW</span>
                    )}
                  </span>
                  {run.errorText && (
                    <span className={cn('truncate text-xs', run.status === 'cancelled' ? 'text-muted-foreground' : 'text-destructive/80')}>
                      {run.errorText}
                    </span>
                  )}
                </div>
              </td>
              {showRepo && (
                <td className="hidden px-3 py-2.5 sm:table-cell">
                  <span className="block max-w-[16rem] truncate text-xs text-muted-foreground">{repoName}</span>
                </td>
              )}
              <td className="hidden px-3 py-2.5 capitalize text-muted-foreground sm:table-cell">{run.triggerSource}</td>
              <td className="px-3 py-2.5">
                <span className="text-muted-foreground" title={new Date(startedAt).toLocaleString()}>
                  {run.status === 'running' ? 'Running' : formatDistanceToNow(startedAt, { addSuffix: true })}
                </span>
              </td>
              <td className="hidden px-3 py-2.5 tabular-nums text-muted-foreground sm:table-cell">{formatRunDuration(run)}</td>
              <td className="hidden px-3 py-2.5 font-mono text-xs text-muted-foreground sm:table-cell">{formatRunBranch(run) ?? '—'}</td>
              <td className="px-3 py-2.5">
                <div className="flex items-center justify-end">
                  {onDeleteRun && run.status !== 'running' && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onDeleteRun(run.id)
                      }}
                      disabled={deleteRunPending}
                      title="Delete run"
                      aria-label="Delete run"
                      className="flex items-center p-1.5 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
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
