import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsRepository } from './projects.repository.js';
import { ProjectsService } from './projects.service.js';
import { BusinessTimeService } from './business-time.service.js';
import { OverdueProcessor } from './overdue.processor.js';

@Module({
  imports: [AuthModule],
  controllers: [ProjectsController],
  providers: [
    ProjectsRepository,
    ProjectsService,
    BusinessTimeService,
    OverdueProcessor,
  ],
  exports: [ProjectsService, BusinessTimeService],
})
export class ProjectsModule {}
