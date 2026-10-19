import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiError } from '@zenovel/contracts';
import { SafeLogger } from './safe-logger.js';

type SafeBadRequest = {
  message?: string;
  fields?: string;
  category: 'validation' | 'business_rule' | 'generic';
};

function safeBadRequest(exception: unknown): SafeBadRequest {
  if (!(exception instanceof HttpException) || exception.getStatus() !== 400)
    return { category: 'generic' };
  const value = exception.getResponse();
  const body =
    typeof value === 'object' && value !== null
      ? (value as { message?: unknown; fields?: unknown })
      : undefined;
  const messages = Array.isArray(body?.message)
    ? body.message.filter(
        (message): message is string =>
          typeof message === 'string' && message.length <= 300,
      )
    : typeof body?.message === 'string'
      ? [body.message]
      : typeof value === 'string'
        ? [value]
        : [];
  const message = messages.find((item) => item !== 'Bad Request');
  const fields = Array.isArray(body?.fields)
    ? [
        ...new Set(
          body.fields.filter(
            (field): field is string =>
              typeof field === 'string' && /^[A-Za-z][A-Za-z0-9]*$/.test(field),
          ),
        ),
      ].join(',')
    : undefined;
  return {
    message,
    fields: fields || undefined,
    category: Array.isArray(body?.fields)
      ? 'validation'
      : message
        ? 'business_rule'
        : 'generic',
  };
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  constructor(private readonly logger?: SafeLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const details = safeBadRequest(exception);
    if (statusCode === 400)
      this.logger?.event('request_rejected', {
        requestId: String(response.locals.requestId ?? ''),
        statusCode,
        category: details.category,
        ...(details.fields ? { fields: details.fields } : {}),
      });
    sendError(response, statusCode, details.message);
  }
}
export function sendError(
  response: Response,
  statusCode: number,
  safeMessage?: string,
) {
  const codes: Record<number, [string, string]> = {
    400: ['INVALID_REQUEST', 'Request validation failed.'],
    401: ['AUTHENTICATION_REQUIRED', 'Authentication is required.'],
    403: ['ACCESS_DENIED', 'Access is denied.'],
    409: ['CONFLICT', 'The request conflicts with current state.'],
    404: ['NOT_FOUND', 'Resource not found.'],
    413: ['PAYLOAD_TOO_LARGE', 'Request payload is too large.'],
    429: ['RATE_LIMITED', 'Too many requests. Try again shortly.'],
    503: ['UNAVAILABLE', 'Service temporarily unavailable.'],
  };
  const [code, defaultMessage] = codes[statusCode] ?? [
    'REQUEST_FAILED',
    'The request could not be completed.',
  ];
  const message =
    statusCode === 400 && safeMessage ? safeMessage : defaultMessage;
  const body: ApiError = {
    statusCode,
    code,
    message,
    requestId: String(response.locals.requestId ?? ''),
    timestamp: new Date().toISOString(),
  };
  response.status(statusCode).json(body);
}
