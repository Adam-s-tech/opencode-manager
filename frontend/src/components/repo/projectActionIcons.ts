import {
  Bug,
  CheckCircle2,
  FlaskConical,
  Hammer,
  Play,
  Rocket,
  Server,
  SquareTerminal,
  type LucideIcon,
} from 'lucide-react'
import type { ProjectActionIcon } from '@opencode-manager/shared/types'

export const ACTION_ICON_OPTIONS: { value: ProjectActionIcon; label: string; Icon: LucideIcon }[] = [
  { value: 'play', label: 'Play', Icon: Play },
  { value: 'build', label: 'Build', Icon: Hammer },
  { value: 'test', label: 'Test', Icon: FlaskConical },
  { value: 'lint', label: 'Lint', Icon: CheckCircle2 },
  { value: 'terminal', label: 'Terminal', Icon: SquareTerminal },
  { value: 'server', label: 'Server', Icon: Server },
  { value: 'bug', label: 'Bug', Icon: Bug },
  { value: 'rocket', label: 'Rocket', Icon: Rocket },
]

export function actionIcon(icon: ProjectActionIcon | undefined): LucideIcon {
  return ACTION_ICON_OPTIONS.find((option) => option.value === icon)?.Icon ?? Play
}
