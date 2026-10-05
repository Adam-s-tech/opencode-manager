import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import type { Repo } from '@/api/types'
import { Input } from '@/components/ui/input'
import { useNavigableRepos, useSidebarRepoGroups } from '@/hooks/useSidebarRepoGroups'
import {
  NewSessionButton,
  RepoNavGroup,
  RepoSessionNavList,
  SearchClearButton,
  SessionNavRow,
  SessionNavStatus,
} from '@/components/navigation/RepoSessionNav'
import { getActiveRepoId, isCurrentSessionItem, isRepoReady } from '@/components/navigation/sidebar-session-tree'
import { getRepoPath } from '@/lib/navigation'
import { getRepoDisplayName } from '@/lib/utils'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'

const SESSION_SEARCH_DEBOUNCE_MS = 300

function SessionSearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const clear = () => onChange('')

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.preventDefault()
    else if (event.key === 'Escape') clear()
  }

  return (
    <div className="relative">
      <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        enterKeyHint="search"
        aria-label="Search sessions"
        placeholder="Search sessions..."
        autoComplete="off"
        name="sidebar-session-search"
        className="h-8 pl-8 pr-9"
      />
      {value.length > 0 && <SearchClearButton onClear={clear} />}
    </div>
  )
}

function SessionSearchResults({ repos, search }: { repos: Repo[]; search: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { nameMatchedRepos, otherRepos } = useMemo(() => {
    const query = search.toLowerCase()
    const readyRepos = repos.filter(isRepoReady)
    const isNameMatch = (repo: Repo) => getRepoDisplayName(repo).toLowerCase().includes(query)
    return {
      nameMatchedRepos: readyRepos.filter(isNameMatch),
      otherRepos: readyRepos.filter((repo) => !isNameMatch(repo)),
    }
  }, [repos, search])
  const nameMatches = useSidebarRepoGroups({ repos: nameMatchedRepos })
  const sessionMatches = useSidebarRepoGroups({ repos: otherRepos, search })
  const isLoading = nameMatches.isLoading || sessionMatches.isLoading
  const isError = nameMatches.isError || sessionMatches.isError
  const matchingGroups = [
    ...nameMatches.groups,
    ...sessionMatches.groups.filter((group) => group.items.length > 0),
  ]

  if (isLoading) return <SessionNavStatus>Loading sessions...</SessionNavStatus>
  if (isError) return <SessionNavStatus>Failed to load sessions</SessionNavStatus>
  if (matchingGroups.length === 0) return <SessionNavStatus>No sessions found</SessionNavStatus>

  return (
    <>
      {matchingGroups.map((group) => (
        <RepoNavGroup
          key={group.repo.id}
          name={group.label}
          branch={group.branchLabel}
          isWorktree={group.repo.isWorktree}
          isOpen
          isCurrent={group.repo.id === getActiveRepoId(location.pathname)}
          onOpenRepo={() => navigate(getRepoPath(group.repo.id))}
          actions={<NewSessionButton repo={group.repo} onOpenSession={navigate} />}
        >
          {group.items.map((item) => (
            <SessionNavRow
              key={item.key}
              item={item}
              isCurrent={isCurrentSessionItem(item, location.pathname)}
              onSelect={navigate}
            />
          ))}
        </RepoNavGroup>
      ))}
    </>
  )
}

export function DesktopSessionTree() {
  const navigate = useNavigate()
  const location = useLocation()
  const [draft, setDraft] = useState('')
  const trimmedDraft = draft.trim()
  const debouncedSearch = useDebouncedValue(trimmedDraft, SESSION_SEARCH_DEBOUNCE_MS)
  const search = trimmedDraft ? debouncedSearch : ''
  const { repos, isLoading } = useNavigableRepos()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-2 pb-2">
        <SessionSearchInput value={draft} onChange={setDraft} />
      </div>

      <div role="region" aria-label="Session navigator" className="min-h-0 flex-1 overflow-y-auto pb-2">
        {isLoading ? (
          <SessionNavStatus>Loading repos...</SessionNavStatus>
        ) : search ? (
          <SessionSearchResults repos={repos} search={search} />
        ) : (
          <RepoSessionNavList
            repos={repos}
            activeRepoId={getActiveRepoId(location.pathname)}
            isVisible
            onOpenRepo={(repoId) => navigate(getRepoPath(repoId))}
            onSelectSession={navigate}
            renderActions={(repo) => <NewSessionButton repo={repo} onOpenSession={navigate} />}
          />
        )}
      </div>
    </div>
  )
}
