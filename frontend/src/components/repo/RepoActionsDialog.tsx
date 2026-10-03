import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Bug,
  CheckCircle2,
  FlaskConical,
  Hammer,
  Loader2,
  Pencil,
  Play,
  Plus,
  Rocket,
  Server,
  ShieldAlert,
  SquareTerminal,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useMoveProjectItem,
  useProjectConfig,
  useTrustRepoConfig,
  useUpdateProjectActions,
  useUpdateWorktreeSetup,
} from '@/api/projectConfig'
import { showToast } from '@/lib/toast'
import type { ProjectAction, ProjectActionIcon, ProjectItemSource } from '@opencode-manager/shared/types'

const ACTION_ICON_OPTIONS: { value: ProjectActionIcon; label: string; Icon: LucideIcon }[] = [
  { value: 'play', label: 'Play', Icon: Play },
  { value: 'build', label: 'Build', Icon: Hammer },
  { value: 'test', label: 'Test', Icon: FlaskConical },
  { value: 'lint', label: 'Lint', Icon: CheckCircle2 },
  { value: 'terminal', label: 'Terminal', Icon: SquareTerminal },
  { value: 'server', label: 'Server', Icon: Server },
  { value: 'bug', label: 'Bug', Icon: Bug },
  { value: 'rocket', label: 'Rocket', Icon: Rocket },
]

function actionIcon(icon: ProjectActionIcon | undefined): LucideIcon {
  return ACTION_ICON_OPTIONS.find((option) => option.value === icon)?.Icon ?? Play
}

interface ActionDraft {
  id: string
  name: string
  command: string
  icon: ProjectActionIcon
  url: string
  autoOpenUrl: boolean
}

function emptyActionDraft(): ActionDraft {
  return { id: crypto.randomUUID(), name: '', command: '', icon: 'play', url: '', autoOpenUrl: false }
}

function actionToDraft(action: ProjectAction): ActionDraft {
  return {
    id: action.id,
    name: action.name,
    command: action.command,
    icon: action.icon ?? 'play',
    url: action.url ?? '',
    autoOpenUrl: action.autoOpenUrl,
  }
}

function actionToPayload(action: ProjectAction): ProjectAction {
  const payload: ProjectAction = {
    id: action.id,
    name: action.name,
    command: action.command,
    autoOpenUrl: action.autoOpenUrl,
  }
  if (action.icon) payload.icon = action.icon
  if (action.url) payload.url = action.url
  return payload
}

function draftToPayload(draft: ActionDraft): ProjectAction {
  const payload: ProjectAction = {
    id: draft.id,
    name: draft.name.trim(),
    command: draft.command.trim(),
    icon: draft.icon,
    autoOpenUrl: draft.autoOpenUrl,
  }
  const url = draft.url.trim()
  if (url) payload.url = url
  return payload
}

function moveArrayItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

function mutationErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

interface ActionFormProps {
  draft: ActionDraft
  isSaving: boolean
  onChange: (draft: ActionDraft) => void
  onSave: (draft: ActionDraft) => void
  onCancel: () => void
}

function ActionForm({ draft, isSaving, onChange, onSave, onCancel }: ActionFormProps) {
  const canSave = draft.name.trim().length > 0 && draft.command.trim().length > 0

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="action-name">Name</Label>
        <Input
          id="action-name"
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="action-command">Command</Label>
        <Input
          id="action-command"
          value={draft.command}
          onChange={(event) => onChange({ ...draft, command: event.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="action-icon">Icon</Label>
        <Select
          value={draft.icon}
          onValueChange={(value) => onChange({ ...draft, icon: value as ProjectActionIcon })}
        >
          <SelectTrigger id="action-icon">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTION_ICON_OPTIONS.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="action-url">URL template</Label>
        <Input
          id="action-url"
          placeholder="http://localhost:3000/{worktree}"
          value={draft.url}
          onChange={(event) => onChange({ ...draft, url: event.target.value })}
        />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="action-auto-open">Auto-open URL</Label>
        <Switch
          id="action-auto-open"
          checked={draft.autoOpenUrl}
          onCheckedChange={(checked) => onChange({ ...draft, autoOpenUrl: checked })}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={() => onSave(draft)} disabled={!canSave || isSaving}>
          Save
        </Button>
      </div>
    </div>
  )
}

interface RepoActionsDialogProps {
  repoId: number
  directory: string | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RepoActionsDialog({ repoId, directory, open, onOpenChange }: RepoActionsDialogProps) {
  const configQuery = useProjectConfig(repoId, directory, open && !!directory)
  const updateActions = useUpdateProjectActions(repoId, directory)
  const updateSetup = useUpdateWorktreeSetup(repoId, directory)
  const trustConfig = useTrustRepoConfig(repoId)
  const moveItem = useMoveProjectItem(repoId)

  const [draft, setDraft] = useState<ActionDraft | null>(null)
  const [setupCommands, setSetupCommands] = useState<string[]>([])

  const config = configQuery.data

  const personalActions = useMemo(
    () => (config?.actions ?? []).filter((action) => action.source === 'personal'),
    [config],
  )
  const repoActions = useMemo(
    () => (config?.actions ?? []).filter((action) => action.source === 'repo'),
    [config],
  )
  const repoSetup = useMemo(
    () => (config?.worktreeSetup ?? []).filter((item) => item.source === 'repo'),
    [config],
  )
  const personalSetup = useMemo(
    () => (config?.worktreeSetup ?? []).filter((item) => item.source === 'personal').map((item) => item.command),
    [config],
  )
  const personalSetupBaseline = useMemo(() => JSON.stringify(personalSetup), [personalSetup])
  const setupSyncKey = useRef<string | null>(null)

  useEffect(() => {
    if (!open || !config) {
      setupSyncKey.current = null
      return
    }
    const syncKey = `${directory ?? ''}\u0000${personalSetupBaseline}`
    if (setupSyncKey.current === syncKey) return
    setupSyncKey.current = syncKey
    setSetupCommands(personalSetup)
  }, [open, config, directory, personalSetup, personalSetupBaseline])

  const setupDirty = useMemo(
    () =>
      setupCommands.length !== personalSetup.length ||
      setupCommands.some((command, index) => command !== personalSetup[index]),
    [setupCommands, personalSetup],
  )

  const handleSaveAction = (nextDraft: ActionDraft) => {
    const payload = draftToPayload(nextDraft)
    const exists = personalActions.some((action) => action.id === payload.id)
    const next = exists
      ? personalActions.map((action) => (action.id === payload.id ? payload : actionToPayload(action)))
      : [...personalActions.map(actionToPayload), payload]
    updateActions.mutate(next, {
      onSuccess: () => setDraft(null),
      onError: (error) => showToast.error(mutationErrorMessage(error, 'Failed to save action')),
    })
  }

  const handleDeleteAction = (id: string) => {
    updateActions.mutate(personalActions.filter((action) => action.id !== id).map(actionToPayload), {
      onError: (error) => showToast.error(mutationErrorMessage(error, 'Failed to delete action')),
    })
  }

  const handleSaveSetup = () => {
    updateSetup.mutate(setupCommands.map((command) => command.trim()), {
      onError: (error) => showToast.error(mutationErrorMessage(error, 'Failed to save setup commands')),
    })
  }

  const handleTrust = () => {
    if (!config?.repoFile.hash) return
    trustConfig.mutate(
      { hash: config.repoFile.hash, directory },
      { onError: (error) => showToast.error(mutationErrorMessage(error, 'Failed to trust repository commands')) },
    )
  }

  const moveAction = (action: ProjectAction, to: ProjectItemSource) => {
    moveItem.mutate(
      { kind: 'action', id: action.id, to, directory },
      { onError: (error) => showToast.error(mutationErrorMessage(error, 'Failed to move action')) },
    )
  }

  const moveSetup = (command: string, to: ProjectItemSource) => {
    moveItem.mutate(
      { kind: 'setup', command, to, directory },
      { onError: (error) => showToast.error(mutationErrorMessage(error, 'Failed to move setup command')) },
    )
  }

  const isAddingAction = draft !== null && !personalActions.some((action) => action.id === draft.id)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mobileFullscreen
        className="sm:fixed sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[520px] sm:max-w-[520px] sm:h-auto sm:max-h-[85vh] flex flex-col gap-0 pb-safe"
      >
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-2 sm:pb-3 shrink-0">
          <DialogTitle>Project Actions</DialogTitle>
          <DialogDescription>Commands and setup steps for this location.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-4 sm:pb-6 space-y-6">
          {configQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </div>
          ) : !config ? (
            <p className="text-sm text-destructive">
              {configQuery.error instanceof Error ? configQuery.error.message : 'No configuration available.'}
            </p>
          ) : (
            <>
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Actions</h3>
                  <Button type="button" size="sm" variant="outline" onClick={() => setDraft(emptyActionDraft())}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add action
                  </Button>
                </div>

                {personalActions.length === 0 && repoActions.length === 0 && (
                  <p className="text-sm text-muted-foreground">No actions configured.</p>
                )}

                {personalActions.map((action) => {
                  const Icon = actionIcon(action.icon)
                  const isEditing = draft?.id === action.id
                  return (
                    <div key={action.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                      {isEditing && draft ? (
                        <ActionForm
                          draft={draft}
                          isSaving={updateActions.isPending}
                          onChange={setDraft}
                          onSave={handleSaveAction}
                          onCancel={() => setDraft(null)}
                        />
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium truncate">{action.name}</span>
                          </div>
                          <p className="font-mono text-xs text-muted-foreground truncate">{action.command}</p>
                          {action.url && (
                            <p className="text-xs text-muted-foreground truncate">{action.url}</p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setDraft(actionToDraft(action))}
                            >
                              <Pencil className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => moveAction(action, 'repo')}
                              disabled={moveItem.isPending}
                            >
                              Move to repository
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeleteAction(action.id)}
                              disabled={updateActions.isPending}
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}

                {repoActions.map((action) => {
                  const Icon = actionIcon(action.icon)
                  return (
                    <div key={action.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium truncate">{action.name}</span>
                        <Badge variant="secondary">In repo</Badge>
                      </div>
                      <p className="font-mono text-xs text-muted-foreground truncate">{action.command}</p>
                      {action.url && (
                        <p className="text-xs text-muted-foreground truncate">{action.url}</p>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => moveAction(action, 'personal')}
                        disabled={moveItem.isPending}
                      >
                        Move to my settings
                      </Button>
                    </div>
                  )
                })}

                {isAddingAction && draft && (
                  <div className="rounded-lg border border-border bg-card p-3">
                    <ActionForm
                      draft={draft}
                      isSaving={updateActions.isPending}
                      onChange={setDraft}
                      onSave={handleSaveAction}
                      onCancel={() => setDraft(null)}
                    />
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold">Worktree setup</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Commands run after a new worktree is created. Use{' '}
                    <code className="font-mono">$ROOT_PROJECT_PATH</code> to reference the main checkout.
                  </p>
                </div>

                {setupCommands.length === 0 && repoSetup.length === 0 && (
                  <p className="text-sm text-muted-foreground">No setup commands.</p>
                )}

                {setupCommands.map((command, index) => (
                  <div key={index} className="rounded-lg border border-border bg-card p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        aria-label={`Setup command ${index + 1}`}
                        value={command}
                        onChange={(event) =>
                          setSetupCommands((current) =>
                            current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)),
                          )
                        }
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Move up"
                        disabled={index === 0}
                        onClick={() => setSetupCommands((current) => moveArrayItem(current, index, index - 1))}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Move down"
                        disabled={index === setupCommands.length - 1}
                        onClick={() => setSetupCommands((current) => moveArrayItem(current, index, index + 1))}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Remove command"
                        onClick={() => setSetupCommands((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => moveSetup(command, 'repo')}
                        disabled={setupDirty || moveItem.isPending}
                      >
                        Move to repository
                      </Button>
                    </div>
                  </div>
                ))}

                {repoSetup.map((item) => (
                  <div
                    key={item.command}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-3"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-xs truncate">{item.command}</span>
                      <Badge variant="secondary">In repo</Badge>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => moveSetup(item.command, 'personal')}
                      disabled={moveItem.isPending}
                    >
                      Move to my settings
                    </Button>
                  </div>
                ))}

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setSetupCommands((current) => [...current, ''])}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add command
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSaveSetup}
                    disabled={setupCommands.some((command) => !command.trim()) || updateSetup.isPending}
                  >
                    Save setup
                  </Button>
                </div>
              </section>

              <section className="space-y-2">
                {config.repoFile.error && (
                  <p role="alert" className="text-sm text-destructive">
                    {config.repoFile.error}
                  </p>
                )}
                {config.repoFile.warnings.map((warning) => (
                  <p key={warning} className="text-xs text-warning">
                    {warning}
                  </p>
                ))}
                {config.repoFile.exists && !config.repoFile.trusted && config.repoFile.hash && (
                  <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ShieldAlert className="h-4 w-4 text-warning" />
                      Repository commands are not trusted
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This repository defines commands that run on your machine. Review and trust them to enable.
                    </p>
                    <ul className="space-y-1">
                      {repoActions.map((action) => (
                        <li key={action.id} className="font-mono text-xs">
                          {action.command}
                          {action.url ? ` — ${action.url}` : ''}
                        </li>
                      ))}
                      {repoSetup.map((item) => (
                        <li key={item.command} className="font-mono text-xs">
                          {item.command}
                        </li>
                      ))}
                    </ul>
                    <Button type="button" size="sm" onClick={handleTrust} disabled={trustConfig.isPending}>
                      Trust these commands
                    </Button>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
