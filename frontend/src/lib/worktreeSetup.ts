import type { WorktreeSetupResult } from '@opencode-manager/shared/types'
import { showToast } from '@/lib/toast'

export function notifyWorktreeSetup(setup: WorktreeSetupResult | undefined): void {
  if (!setup) return
  if (setup.status === 'failed') {
    showToast.warning('Worktree setup failed to start')
    return
  }
  if (setup.status === 'skipped' || (setup.status === 'started' && setup.repoCommandsSkipped)) {
    showToast.info('Repository setup commands were skipped until trusted in Actions')
  }
}
