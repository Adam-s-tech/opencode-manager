import { useSettings } from '@/hooks/useSettings'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { SessionDefaults, SessionPermissionMode } from '@opencode-manager/shared/schemas'

export function SessionAutomationSettings() {
  const { preferences, updateSettings } = useSettings()
  const sessionDefaults = preferences?.sessionDefaults
  const permissionMode = sessionDefaults?.permissionMode ?? 'ask'
  const goalMaxContinuations = sessionDefaults?.goalMaxContinuations ?? 20
  const goalTokenBudget = sessionDefaults?.goalTokenBudget
  const goalAuditorModel = sessionDefaults?.goalAuditorModel ?? ''

  const updateSessionDefaults = (patch: Partial<SessionDefaults>) => {
    updateSettings({
      sessionDefaults: {
        ...sessionDefaults,
        permissionMode,
        ...patch,
      },
    })
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">Sessions</h2>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor="sessionPermissionMode">Default permission mode for new sessions</Label>
          <p className="text-sm text-muted-foreground">
            Accept everything answers every "ask" automatically, never overrides deny rules, and only applies to sessions created after the change.
          </p>
        </div>
        <Select
          value={permissionMode}
          onValueChange={(value) => updateSessionDefaults({ permissionMode: value as SessionPermissionMode })}
        >
          <SelectTrigger id="sessionPermissionMode" className="w-full shrink-0 sm:w-40">
            <SelectValue placeholder="Select a mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ask">Ask every time</SelectItem>
            <SelectItem value="auto">Accept everything</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor="goalAuditorModel">Goal auditor model</Label>
          <p className="text-sm text-muted-foreground">
            Model that decides whether a session goal is done, as provider/model. Leave empty to use the OpenCode default model.
          </p>
        </div>
        <Input
          id="goalAuditorModel"
          value={goalAuditorModel}
          placeholder="provider/model"
          className="w-full shrink-0 sm:w-64"
          onChange={(event) => updateSessionDefaults({ goalAuditorModel: event.target.value.trim() || undefined })}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor="goalMaxContinuations">Max automatic continuations</Label>
          <p className="text-sm text-muted-foreground">
            How many times a goal may keep the agent working after each audit before it stops.
          </p>
        </div>
        <Input
          id="goalMaxContinuations"
          type="number"
          min={1}
          max={200}
          value={goalMaxContinuations}
          className="w-full shrink-0 sm:w-40"
          onChange={(event) => {
            const value = Number(event.target.value)
            if (Number.isInteger(value) && value >= 1 && value <= 200) {
              updateSessionDefaults({ goalMaxContinuations: value })
            }
          }}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor="goalTokenBudget">Token budget per goal</Label>
          <p className="text-sm text-muted-foreground">
            Stop a goal once it has spent this many tokens. Leave empty for no limit.
          </p>
        </div>
        <Input
          id="goalTokenBudget"
          type="number"
          min={1}
          value={goalTokenBudget ?? ''}
          placeholder="No limit"
          className="w-full shrink-0 sm:w-40"
          onChange={(event) => {
            const raw = event.target.value
            if (raw === '') {
              updateSessionDefaults({ goalTokenBudget: undefined })
              return
            }
            const value = Number(raw)
            if (Number.isInteger(value) && value > 0) {
              updateSessionDefaults({ goalTokenBudget: value })
            }
          }}
        />
      </div>
    </div>
  )
}
