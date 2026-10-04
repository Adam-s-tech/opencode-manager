import { useQuery } from '@tanstack/react-query'
import { GitBranch } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { listBranches } from '@/api/repos'
import { getOriginOnlyBranchNames } from '@/lib/utils'

interface BaseBranchSelectProps {
  repoId: number
  value: string
  onValueChange: (value: string) => void
  id?: string
  placeholder: string
}

export function BaseBranchSelect({ repoId, value, onValueChange, id, placeholder }: BaseBranchSelectProps) {
  const { data: branchesData, isLoading } = useQuery({
    queryKey: ['branches', repoId],
    queryFn: () => listBranches(repoId),
    staleTime: 30000,
  })

  const localBranches = (branchesData?.branches ?? []).filter((b) => b.type === 'local')
  const remoteBranchNames = getOriginOnlyBranchNames(branchesData?.branches ?? [])

  return (
    <Select value={value} onValueChange={onValueChange} disabled={isLoading}>
      <SelectTrigger id={id} className="bg-background border-border text-foreground">
        <SelectValue placeholder={isLoading ? 'Loading branches...' : placeholder} />
      </SelectTrigger>
      <SelectContent className="bg-popover border-border">
        {localBranches.map((branch) => (
          <SelectItem key={`local-${branch.name}`} value={branch.name}>
            <div className="flex items-center gap-2">
              <GitBranch className="w-3.5 h-3.5" />
              <span>{branch.name}</span>
              {branch.current && (
                <span className="text-xs text-muted-foreground">(current)</span>
              )}
            </div>
          </SelectItem>
        ))}
        {remoteBranchNames.map((name) => (
          <SelectItem key={`remote-${name}`} value={`origin/${name}`}>
            <div className="flex items-center gap-2">
              <GitBranch className="w-3.5 h-3.5 text-info" />
              <span>{name}</span>
              <span className="text-xs text-muted-foreground">(remote)</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
