import { useState } from 'react'
import type { ScheduleMcpServer } from '@opencode-manager/shared/types'
import type { McpServerConfig, McpStatusMap } from '@opencode-manager/shared/opencode'
import { ScheduleMcpServerConfigSchema } from '@opencode-manager/shared/schemas'
import { showToast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { TabsContent } from '@/components/ui/tabs'
import { MultiSelect } from '@/components/ui/multi-select'
import { AddMcpServerDialog } from '@/components/settings/AddMcpServerDialog'
import { Loader2, Plus, X } from 'lucide-react'

type McpTabProps = {
  mcpServers: ScheduleMcpServer[]
  onMcpServersChange: (value: ScheduleMcpServer[]) => void
  availableServers: McpStatusMap
  availableServersLoading: boolean
}

function describeConfig(config: NonNullable<ScheduleMcpServer['config']>): string {
  return config.type === 'local' ? config.command.join(' ') : config.url
}

export function McpTab({ mcpServers, onMcpServersChange, availableServers, availableServersLoading }: McpTabProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  const configuredNames = mcpServers.filter((server) => !server.config).map((server) => server.name)
  const customServers = mcpServers.filter((server) => server.config)
  const options = [...new Set([...Object.keys(availableServers), ...configuredNames])]
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({
      value: name,
      label: name,
      description: availableServers[name] ? `Currently ${availableServers[name].status}` : 'Not configured for this repo',
    }))

  const handleConfiguredChange = (names: string[]) => {
    onMcpServersChange([...names.map((name) => ({ name })), ...customServers.filter((server) => !names.includes(server.name))])
  }

  const handleAddCustom = async (name: string, serverConfig: McpServerConfig) => {
    const parsed = ScheduleMcpServerConfigSchema.safeParse(serverConfig)
    if (!parsed.success) {
      showToast.error(parsed.error.issues[0]?.message ?? 'Invalid MCP server configuration')
      throw parsed.error
    }
    onMcpServersChange([...mcpServers.filter((server) => server.name !== name), { name, config: parsed.data }])
  }

  const handleRemoveCustom = (name: string) => {
    onMcpServersChange(mcpServers.filter((server) => server.name !== name))
  }

  return (
    <TabsContent value="mcp" className="mt-0 min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-5">
      <div className="space-y-6">
        <div className="space-y-2">
          <Label>Configured MCP servers</Label>
          <p className="text-xs text-muted-foreground">
            Selected servers are connected for every run, even when they are disabled in the OpenCode configuration. A run fails if one cannot connect.
          </p>
          {availableServersLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <MultiSelect
              value={configuredNames}
              onChange={handleConfiguredChange}
              options={options}
              placeholder="Search and select MCP servers..."
              emptyMessage="No MCP servers configured"
            />
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Schedule-only MCP servers</Label>
            <Button type="button" variant="outline" size="sm" onClick={() => setAddDialogOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Add server
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Servers defined here are added only for this schedule&apos;s runs and are not saved to the OpenCode configuration. Use {'{env:NAME}'} for secrets.
          </p>
          {customServers.length > 0 && (
            <ul className="space-y-2">
              {customServers.map((server) => (
                <li key={server.name} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{server.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{server.config && describeConfig(server.config)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${server.name}`}
                    onClick={() => handleRemoveCustom(server.name)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <AddMcpServerDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSubmit={handleAddCustom}
        showConnectToggle={false}
      />
    </TabsContent>
  )
}
