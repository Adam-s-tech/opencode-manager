import { Shield, ShieldCheck } from 'lucide-react'
import { usePermissionModeToggle } from '@/hooks/usePermissionModeToggle'
import { IconToggleButton } from '@/components/ui/icon-toggle-button'

interface PermissionModeToggleProps {
  sessionID: string
  directory: string
}

export function PermissionModeToggle({ sessionID, directory }: PermissionModeToggleProps) {
  const { isAuto, disabled, label, toggle } = usePermissionModeToggle(sessionID, directory)

  return (
    <IconToggleButton active={isAuto} label={label} disabled={disabled} onClick={toggle}>
      {isAuto ? <ShieldCheck className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
    </IconToggleButton>
  )
}
