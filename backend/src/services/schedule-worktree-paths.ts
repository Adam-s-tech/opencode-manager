import path from 'path'
import { getScheduleWorktreesPath } from '@opencode-manager/shared/config/env'

const SCHEDULE_WORKTREE_DIRECTORY = /^job-(\d+)-(?:run-(\d+)|shared)$/

export function getSharedScheduleWorktreePath(jobId: number): string {
  return path.join(getScheduleWorktreesPath(), `job-${jobId}-shared`)
}

export function getRunScheduleWorktreePath(jobId: number, runId: number): string {
  return path.join(getScheduleWorktreesPath(), `job-${jobId}-run-${runId}`)
}

export function getSharedScheduleBranch(jobId: number): string {
  return `schedule/${jobId}/shared`
}

export function getRunScheduleBranch(jobId: number, runId: number): string {
  return `schedule/${jobId}/run-${runId}`
}

/**
 * Reads the job and run a schedule worktree directory name belongs to. `runId` is null
 * for a schedule's shared worktree; non-schedule names return null.
 */
export function parseScheduleWorktreeName(name: string): { jobId: number; runId: number | null } | null {
  const match = SCHEDULE_WORKTREE_DIRECTORY.exec(name)
  if (!match) return null
  return { jobId: Number(match[1]), runId: match[2] ? Number(match[2]) : null }
}
