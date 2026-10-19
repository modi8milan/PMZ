import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SafeLogger } from '../common/safe-logger.js';
import type { Environment } from '../config/environment.js';
import { BusinessTimeService } from './business-time.service.js';
import { ProjectsRepository } from './projects.repository.js';

export type OverdueRunResult = {
  status: 'completed' | 'busy' | 'failed';
  processed: number;
};

@Injectable()
export class OverdueProcessor
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new SafeLogger();
  private readonly intervalMs: number;
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly projects: ProjectsRepository,
    private readonly businessTime: BusinessTimeService,
    config: ConfigService<Environment, true>,
  ) {
    this.intervalMs =
      config.get('OVERDUE_PROCESSING_INTERVAL_MS', { infer: true }) ?? 60_000;
  }

  onApplicationBootstrap() {
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(): Promise<OverdueRunResult> {
    if (this.running) return { status: 'busy', processed: 0 };
    this.running = true;
    const businessDate = this.businessTime.businessDate();
    try {
      const raised = await this.projects.raiseOverdue(businessDate);
      this.logger.event('overdue_processing_completed', {
        businessDate,
        processed: raised.length,
      });
      return { status: 'completed', processed: raised.length };
    } catch {
      this.logger.event('overdue_processing_failed', { businessDate });
      return { status: 'failed', processed: 0 };
    } finally {
      this.running = false;
    }
  }
}
