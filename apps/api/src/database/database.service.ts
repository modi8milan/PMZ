import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import type { Environment } from '../config/environment.js';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly pool: Pool;
  constructor(config: ConfigService<Environment, true>) {
    this.pool = new Pool({
      connectionString: config.get('DATABASE_URL', { infer: true }),
      max: config.get('DB_POOL_MAX', { infer: true }),
      connectionTimeoutMillis: config.get('DB_TIMEOUT_MS', { infer: true }),
      statement_timeout: config.get('DB_TIMEOUT_MS', { infer: true }),
      query_timeout: config.get('DB_TIMEOUT_MS', { infer: true }),
      options: '-c timezone=UTC',
      application_name: 'zenovel-stage1',
    });
    this.pool.on('error', () => {
      /* probe reports failure; never log connection details */
    });
  }
  async probe(): Promise<{ database: 'up' | 'down'; schema: 'up' | 'down' }> {
    try {
      const result = await this.pool.query<{ initialized: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'zenovel') AS initialized",
      );
      return {
        database: 'up',
        schema: result.rows[0]?.initialized ? 'up' : 'down',
      };
    } catch {
      return { database: 'down', schema: 'down' };
    }
  }
  async onApplicationShutdown() {
    await this.pool.end();
  }
}
