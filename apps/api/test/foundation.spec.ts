import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { IsString } from 'class-validator';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { SafeLogger } from '../src/common/safe-logger.js';
import { setup } from '../src/setup.js';
import { validateEnvironment } from '../src/config/environment.js';

const env = {
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test',
  CORS_ORIGINS: 'http://localhost:3000',
  RATE_LIMIT: '3',
  RATE_TTL_MS: '60000',
  NODE_ENV: 'test',
  PASSWORD_EXPIRY_DAYS: '30',
  PASSWORD_HISTORY_COUNT: '5',
  SESSION_IDLE_MINUTES: '30',
  SESSION_ABSOLUTE_HOURS: '8',
  LOGIN_MAX_FAILURES: '5',
  LOCKOUT_MINUTES: '15',
  RESET_TOKEN_MINUTES: '30',
  SESSION_COOKIE_NAME: 'zenovel_session',
  MFA_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
  BOOTSTRAP_TOKEN: 'test-bootstrap-token-with-32-characters',
};
Object.assign(process.env, env);
const { AppModule } = await import('../src/app.module.js');
describe('configuration', () => {
  it('accepts local configuration and coerces limits', () => {
    assert.equal(validateEnvironment(env).RATE_LIMIT, 3);
  });
  for (const override of [
    { DATABASE_URL: 'postgresql://secret:secret@production.example/db' },
    { CORS_ORIGINS: '*' },
    { HOST: '0.0.0.0' },
    { PORT: '-1' },
    { DATABASE_URL: 'not-a-url' },
    {
      DATABASE_URL:
        'postgresql://test:REPLACE_WITH_LOCAL_PASSWORD@127.0.0.1/test',
    },
  ]) {
    it(`rejects unsafe ${Object.keys(override)[0]} without echoing values`, () => {
      assert.throws(
        () => validateEnvironment({ ...env, ...override }),
        (error: unknown) => {
          assert.match(String(error), /Invalid environment configuration/);
          assert.doesNotMatch(String(error), /secret/);
          return true;
        },
      );
    });
  }
});

describe('API foundation (mocked database)', () => {
  let app: NestExpressApplication;
  let checks = { database: 'up', schema: 'up' };
  const probe = mock.fn(async () => checks);
  beforeEach(async () => {
    Object.assign(process.env, env);
    probe.mock.resetCalls();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({ probe })
      .compile();
    app = module.createNestApplication<NestExpressApplication>({
      logger: false,
      bodyParser: false,
    });
    setup(app, new SafeLogger());
    await app.init();
    assert.equal(app.get(ConfigService).get('RATE_LIMIT'), 3);
  });
  afterEach(async () => {
    await app.close();
  });
  it('returns liveness with safe headers and UTC timestamp', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    assert.equal(response.body.status, 'ok');
    assert.match(response.body.timestamp, /Z$/);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['x-powered-by'], undefined);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(probe.mock.callCount(), 0);
  });
  for (const entry of [
    {
      checks: { database: 'up', schema: 'up' },
      status: 200,
      readiness: 'ready',
    },
    {
      checks: { database: 'down', schema: 'down' },
      status: 503,
      readiness: 'not_ready',
    },
    {
      checks: { database: 'up', schema: 'down' },
      status: 503,
      readiness: 'not_ready',
    },
  ]) {
    it(`reports dependency state ${JSON.stringify(entry.checks)}`, async () => {
      checks = entry.checks;
      const response = await request(app.getHttpServer())
        .get('/api/v1/ready')
        .expect(entry.status);
      assert.equal(response.body.status, entry.readiness);
      assert.deepEqual(response.body.checks, checks);
      assert.doesNotMatch(JSON.stringify(response.body), /postgresql:\/\//);
    });
  }
  it('allows only configured browser origins', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:3000');
    assert.equal(
      allowed.headers['access-control-allow-origin'],
      'http://localhost:3000',
    );
    const denied = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'https://untrusted.example');
    assert.equal(denied.headers['access-control-allow-origin'], undefined);
    const roleRetirementPreflight = await request(app.getHttpServer())
      .options('/api/v1/admin/roles/test-role')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'DELETE')
      .expect(204);
    assert.match(
      roleRetirementPreflight.headers['access-control-allow-methods'] ?? '',
      /(?:^|,)DELETE(?:,|$)/,
    );
  });
  it('limits repeated requests', async () => {
    for (let i = 0; i < 3; i++)
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(429);
    assert.equal(response.body.code, 'RATE_LIMITED');
  });
  it('returns a sanitized error envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/sensitive?password=hidden')
      .expect(404);
    assert.equal(response.body.code, 'NOT_FOUND');
    assert.ok(response.body.requestId);
    assert.doesNotMatch(
      JSON.stringify(response.body),
      /hidden|stack|sensitive/,
    );
  });
  it('sanitizes errors within the versioned API', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/missing?token=hidden')
      .expect(404);
    assert.equal(response.body.code, 'NOT_FOUND');
    assert.doesNotMatch(JSON.stringify(response.body), /hidden|missing|stack/);
  });
  it('sanitizes malformed JSON', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);
    assert.equal(response.body.code, 'INVALID_REQUEST');
    assert.ok(response.body.requestId);
    assert.doesNotMatch(JSON.stringify(response.body), /SyntaxError|stack/);
  });
  it('enforces the payload size limit', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .send({ value: 'x'.repeat(70000) })
      .expect(413);
    assert.equal(response.body.code, 'PAYLOAD_TOO_LARGE');
  });
});

class TestDto {
  @IsString() name!: string;
}
it('global validation settings reject unexpected properties', async () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  await assert.rejects(
    pipe.transform(
      { name: 'value', unexpected: true },
      { type: 'body', metatype: TestDto },
    ),
    BadRequestException,
  );
});
