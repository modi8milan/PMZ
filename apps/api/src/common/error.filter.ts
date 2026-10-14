import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiError } from '@zenovel/contracts';

@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    sendError(response, statusCode);
  }
}
export function sendError(response: Response, statusCode: number) {
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
  const [code, message] = codes[statusCode] ?? [
    'REQUEST_FAILED',
    'The request could not be completed.',
  ];
  const body: ApiError = {
    statusCode,
    code,
    message,
    requestId: String(response.locals.requestId ?? ''),
    timestamp: new Date().toISOString(),
  };
  response.status(statusCode).json(body);
}
