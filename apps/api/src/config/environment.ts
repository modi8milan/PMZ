import { z } from 'zod';

const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);
const origin = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return (
      loopback.has(url.hostname) &&
      url.origin === value &&
      url.protocol === 'http:'
    );
  } catch {
    return false;
  }
});
const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  HOST: z.enum(['127.0.0.1', '::1']).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1024).max(65535).default(4000),
  CORS_ORIGINS: z
    .string()
    .transform((value) => value.split(',').map((item) => item.trim()))
    .pipe(z.array(origin).min(1)),
  DATABASE_URL: z.string().refine((value) => {
    try {
      const url = new URL(value);
      return (
        ['postgres:', 'postgresql:'].includes(url.protocol) &&
        loopback.has(url.hostname) &&
        Boolean(url.username && url.password && url.pathname.length > 1) &&
        !value.includes('REPLACE_') &&
        !url.search
      );
    } catch {
      return false;
    }
  }),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  DB_TIMEOUT_MS: z.coerce.number().int().min(500).max(10000).default(3000),
  RATE_LIMIT: z.coerce.number().int().min(1).max(1000).default(60),
  RATE_TTL_MS: z.coerce.number().int().min(1000).max(3600000).default(60000),
});
export type Environment = z.infer<typeof schema>;
export function validateEnvironment(
  input: Record<string, unknown>,
): Environment {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path[0])),
    ].join(', ');
    throw new Error(
      `Invalid environment configuration: ${fields}. See .env.example.`,
    );
  }
  return result.data;
}
