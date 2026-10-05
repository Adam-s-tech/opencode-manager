import type { ProjectConfigResponse } from '@opencode-manager/shared/types'

type RepoFileExecutable = NonNullable<ProjectConfigResponse['repoFile']['executable']>

export function TrustExecutableList({ executable }: { executable: RepoFileExecutable }) {
  return (
    <div className="max-h-64 space-y-3 overflow-y-auto">
      {executable.actions.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium">Actions</p>
          <ul className="space-y-1">
            {executable.actions.map((action) => (
              <li key={action.id} className="space-y-0.5">
                <p className="text-xs font-medium">{action.name}</p>
                <p className="font-mono text-xs">{action.command}</p>
                {action.url && <p className="font-mono text-xs">{action.url}</p>}
                {action.autoOpenUrl && <p className="text-xs">Opens URL automatically</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {executable.setup.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium">Worktree setup commands</p>
          <ul className="space-y-1">
            {executable.setup.map((command, index) => (
              <li key={`${index}-${command}`} className="font-mono text-xs">
                {command}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
