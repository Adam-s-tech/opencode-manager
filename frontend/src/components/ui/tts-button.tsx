import { Loader2, Volume2, VolumeX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTTS } from '@/hooks/useTTS'

interface TTSButtonProps {
  messageId: string
  content: string
  className?: string
}

export function TTSButton({ messageId, content, className }: TTSButtonProps) {
  const { speakMessage, stop, isEnabled, isPlaying, isLoading, activeMessageId } = useTTS()

  if (!isEnabled || !content.trim()) {
    return null
  }

  const isThisPlaying = (isPlaying || isLoading) && activeMessageId === messageId
  const label = isThisPlaying ? 'Stop playback' : 'Read aloud'

  const handleClick = () => {
    if (isThisPlaying) {
      stop()
    } else {
      speakMessage(messageId, content)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn('p-1.5 rounded', isThisPlaying ? 'bg-destructive/20 text-destructive hover:bg-destructive/30' : 'bg-card hover:bg-card-hover text-muted-foreground hover:text-foreground', className)}
      title={label}
      aria-label={label}
      disabled={isLoading && !isThisPlaying}
    >
      {isLoading && isThisPlaying ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : isThisPlaying ? (
        <VolumeX className="w-4 h-4" />
      ) : (
        <Volume2 className="w-4 h-4" />
      )}
    </button>
  )
}
