import { useState } from 'react'
import type { ScheduleJob, ScheduleRun } from '@opencode-manager/shared/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { History, Loader2, Trash2 } from 'lucide-react'
import { ScheduleListToolbar, ScheduleRunDrawer, ScheduleRunsTable } from '@/components/schedules'
import { formatRunBranch, getRunStatusLabel, getRunTitle } from './schedule-run-display'

interface RunHistoryTabProps {
  selectedJob: ScheduleJob | undefined
  runs: ScheduleRun[] | undefined
  runsLoading: boolean
  runId: number | null
  onSelectRun: (id: number | null) => void
  onCancelRun: () => void
  cancelRunPending: boolean
  onClearHistory: () => void
  clearHistoryPending: boolean
  onDeleteRun: (runId: number) => void
  deleteRunPending: boolean
}

export function RunHistoryTab({
  selectedJob,
  runs,
  runsLoading,
  runId,
  onSelectRun,
  onCancelRun,
  cancelRunPending,
  onClearHistory,
  clearHistoryPending,
  onDeleteRun,
  deleteRunPending,
}: RunHistoryTabProps) {
  const [search, setSearch] = useState('')

  if (!selectedJob) {
    return (
      <div className="flex min-h-0 flex-1 h-full items-start">
        <Card className="max-w-3xl border-dashed border-border/70 w-full">
          <CardContent className="flex flex-col items-center p-8 sm:p-10 text-center">
            <History className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No job selected</p>
            <p className="mt-2 text-sm text-muted-foreground">Select a job from the Jobs tab to view its run history</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const searchTerm = search.trim().toLowerCase()
  const runList = (runs ?? []).filter((run) => !searchTerm || [
    getRunTitle(run),
    getRunStatusLabel(run.status),
    run.triggerSource,
    formatRunBranch(run),
    run.errorText,
  ].some((field) => field?.toLowerCase().includes(searchTerm)))
  const activeRun = runId !== null ? runs?.find((run) => run.id === runId) ?? null : null
  const activeIndex = activeRun ? runList.findIndex((run) => run.id === activeRun.id) : -1

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ScheduleListToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Search runs">
        <Button
          variant="outline"
          size="sm"
          className="h-9 shrink-0"
          onClick={onClearHistory}
          disabled={clearHistoryPending || !runs?.length}
          aria-label="Clear history"
        >
          {clearHistoryPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">Clear history</span>
        </Button>
      </ScheduleListToolbar>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-2 pb-2">
        <div className="min-h-0 overflow-auto rounded-lg border border-border/70">
          <ScheduleRunsTable
            runs={runList}
            runsLoading={runsLoading}
            selectedRunId={runId}
            onSelectRun={onSelectRun}
            onDeleteRun={onDeleteRun}
            deleteRunPending={deleteRunPending}
            isFiltered={Boolean(searchTerm)}
          />
        </div>
      </div>
      <ScheduleRunDrawer
        run={activeRun}
        open={runId !== null}
        onClose={() => onSelectRun(null)}
        onCancelRun={onCancelRun}
        cancelPending={cancelRunPending}
        onPrev={activeIndex > 0 ? () => onSelectRun(runList[activeIndex - 1].id) : undefined}
        onNext={activeIndex >= 0 && activeIndex < runList.length - 1 ? () => onSelectRun(runList[activeIndex + 1].id) : undefined}
      />
    </div>
  )
}
