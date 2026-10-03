import { parseLocalDevUrl } from './preview-url'

export interface OpenUrlHandlers {
  openPreview?: (port: number, path: string) => void
}

export function openUrlFromManager(url: string, handlers: OpenUrlHandlers): void {
  const localDevUrl = parseLocalDevUrl(url)
  if (localDevUrl && handlers.openPreview) {
    handlers.openPreview(localDevUrl.port, localDevUrl.path)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}
