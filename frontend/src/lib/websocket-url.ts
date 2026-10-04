import { API_BASE_URL } from '@/config'

export function toWebSocketUrl(pathWithQuery: string): string {
  const base = API_BASE_URL || window.location.origin
  const url = new URL(pathWithQuery, base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}
