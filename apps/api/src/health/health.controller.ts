import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { HealthResponse, ReadinessResponse } from '@zenovel/contracts';
import { DatabaseService } from '../database/database.service.js';
import { Public } from '../auth/auth.decorators.js';

@Public()
@Controller()
export class HealthController {
  constructor(private readonly database: DatabaseService) {}
  @Get('health')
  health(): HealthResponse {
    return {
      status: 'ok',
      service: 'zenovel-api',
      timestamp: new Date().toISOString(),
    };
  }
  @Get('ready')
  async ready(
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReadinessResponse> {
    const checks = await this.database.probe();
    const ready = checks.database === 'up' && checks.schema === 'up';
    response.status(ready ? 200 : 503);
    return {
      status: ready ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}
