import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ClientError, openCodeErrorStatus } from '@opencode-manager/shared/opencode'
import { isOAuthErrorCode } from '@opencode-manager/shared/schemas'
import { getErrorMessage } from './error-utils'
import { logger } from './logger'

export function parseId(value: string | undefined, label?: string, ErrorClass?: new (message: string, status: number) => Error): number {
  if (!value) {
    throw ErrorClass
      ? new ErrorClass(`Missing ${label || 'id'}`, 400)
      : new Error(`Missing ${label || 'id'}`)
  }

  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) {
    throw ErrorClass
      ? new ErrorClass(`Invalid ${label || 'id'}`, 400)
      : new Error(`Invalid ${label || 'id'}`)
  }
  return parsed
}

interface ServiceError {
  message: string
  statusCode?: number
  status?: number
  code?: string
  details?: unknown
}

type ServiceErrorConstructor = new (message: string, statusOrStatusCode: number) => ServiceError

export function handleServiceError(
  c: Context,
  error: unknown,
  fallback: string,
  ErrorClass: ServiceErrorConstructor,
) {
  if (error instanceof ErrorClass) {
    const serviceError = error as ServiceError
    const status = serviceError.statusCode ?? serviceError.status ?? 500
    return c.json(
      {
        error: error.message,
        ...(serviceError.code !== undefined ? { code: serviceError.code } : {}),
        ...(serviceError.details !== undefined ? { details: serviceError.details } : {}),
      },
      status as ContentfulStatusCode,
    )
  }
  logger.error(fallback, error)
  return c.json({ error: getErrorMessage(error) }, 500)
}

export function handleOpenCodeError(c: Context, error: unknown, fallback: string) {
  if (error instanceof Error) {
    const tag = (error as { _tag?: unknown })._tag
    if (typeof tag === 'string') {
      return c.json({
        error: error.message || fallback,
        ...(isOAuthErrorCode(tag) ? { code: tag } : {}),
      }, openCodeErrorStatus(error) === 404 ? 404 : 502)
    }

    if (error instanceof ClientError) {
      return c.json({ error: fallback, code: 'ClientError' }, 502)
    }
  }

  logger.error(fallback, error)
  return c.json({ error: fallback }, 500)
}
