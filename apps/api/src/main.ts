import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { SafeLogger } from './common/safe-logger.js';
import { setup } from './setup.js';

async function bootstrap() {
  const logger = new SafeLogger();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger,
    bodyParser: false,
    abortOnError: false,
  });
  setup(app, logger);
  app.enableShutdownHooks();
  const config = app.get(ConfigService);
  await app.listen(
    config.getOrThrow<number>('PORT'),
    config.getOrThrow<string>('HOST'),
  );
  logger.event('api_started');
}
void bootstrap().catch(() => {
  process.stderr.write(
    '{"event":"startup_failed","message":"Check local configuration and port availability."}\n',
  );
  process.exitCode = 1;
});
