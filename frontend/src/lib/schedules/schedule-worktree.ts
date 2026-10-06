export function formatScheduleWorktreeLabel(runId: number | null): string {
  return runId === null ? 'Shared worktree' : `Run #${runId}`
}
