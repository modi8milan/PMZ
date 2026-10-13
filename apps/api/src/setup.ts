import { randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { json } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { ErrorFilter, sendError } from './common/error.filter.js';
import { SafeLogger } from './common/safe-logger.js';

export function setup(app: NestExpressApplication, logger: SafeLogger) {
  const config = app.get(ConfigService);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use((_request: Request, response: Response, next: NextFunction) => {
    const requestId = randomUUID();
    response.locals.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('Cache-Control', 'no-store');
    const started = performance.now();
    response.on('finish', () =>
      logger.event('request_completed', {
        requestId,
        status: response.statusCode,
        durationMs: Math.round(performance.now() - started),
      }),
    );
    next();
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (!request.path.startsWith('/api/v1/')) {
      sendError(response, 404);
      return;
    }
    next();
  });
  app.use(json({ limit: '64kb' }));
  app.use(
    (
      error: { status?: number },
      _request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      void _next; // Express requires four arguments to recognize error middleware.
      sendError(response, error.status === 413 ? 413 : 400);
    },
  );
  const origins = config.getOrThrow<string[]>('CORS_ORIGINS');
  app.enableCors({
    origin: origins,
    methods: ['GET', 'OPTIONS'],
    credentials: false,
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
    }),
  );
  app.useGlobalFilters(new ErrorFilter());
}
