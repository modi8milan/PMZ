import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { RequirePermissions, RequireRoles } from '../auth/auth.decorators.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import {
  AssignmentResponseDto,
  CreateProjectDto,
  CreateVisitDto,
  ExportQueryDto,
  MilestoneCorrectionDto,
  MilestoneDto,
  ProjectQueryDto,
  ProjectStatusDto,
  TimelineOverrideDto,
  TrackerQueryDto,
  TransferProjectDto,
} from './projects.dto.js';
import { ProjectsService } from './projects.service.js';

@Controller('projects')
@RequirePermissions('View')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  private requestId(response: Response) {
    return response.locals.requestId as string | undefined;
  }

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query() query: ProjectQueryDto) {
    return this.projects.list(request.auth!.user, query);
  }

  @Get('dashboard')
  dashboard(@Req() request: AuthenticatedRequest) {
    return this.projects.dashboard(request.auth!.user);
  }

  @Get('options')
  @RequireRoles(
    'ASSOCIATE_DIRECTOR_GCP',
    'PROJECT_MANAGER',
    'QMS',
    'DIRECTOR',
    'DIRECTOR_OPERATIONS',
  )
  options() {
    return this.projects.options();
  }

  @Get('notifications')
  notifications(@Req() request: AuthenticatedRequest) {
    return this.projects.notifications(request.auth!.user);
  }

  @Get('tracker')
  @RequireRoles(
    'PROJECT_MANAGER',
    'ASSOCIATE_DIRECTOR_GCP',
    'QMS',
    'DIRECTOR',
    'DIRECTOR_OPERATIONS',
  )
  tracker(
    @Req() request: AuthenticatedRequest,
    @Query() query: TrackerQueryDto,
  ) {
    return this.projects.tracker(request.auth!.user, query);
  }

  @Get('tracker/export')
  @RequirePermissions('Export')
  @RequireRoles('PROJECT_MANAGER', 'ASSOCIATE_DIRECTOR_GCP', 'QMS')
  async export(
    @Req() request: AuthenticatedRequest,
    @Query() query: ExportQueryDto,
    @Res() response: Response,
  ) {
    const content = await this.projects.export(
      request.auth!.user,
      query,
      query.format,
    );
    const extension = query.format;
    response.setHeader(
      'Content-Type',
      extension === 'csv'
        ? 'text/csv; charset=utf-8'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="zenovel-project-tracker.${extension}"`,
    );
    response.send(content);
  }

  @Post()
  @RequirePermissions('Create')
  @RequireRoles('ASSOCIATE_DIRECTOR_GCP')
  create(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateProjectDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.projects.create(
      request.auth!.user,
      input,
      this.requestId(response),
    );
  }

  @Get(':id')
  detail(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.projects.detail(request.auth!.user, id);
  }

  @Post(':id/assignment-response')
  @RequireRoles('PROJECT_MANAGER')
  respond(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: AssignmentResponseDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.projects.respond(
      request.auth!.user,
      id,
      input.decision,
      input.reason,
      this.requestId(response),
    );
  }

  @Patch(':id/status')
  @RequirePermissions()
  @RequireRoles('PROJECT_MANAGER', 'ASSOCIATE_DIRECTOR_GCP')
  status(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ProjectStatusDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.projects.status(
      request.auth!.user,
      id,
      input.status,
      input.reason,
      this.requestId(response),
    );
  }

  @Post(':id/transfer')
  @RequirePermissions()
  @RequireRoles('ASSOCIATE_DIRECTOR_GCP', 'SYSTEM_ADMINISTRATOR')
  transfer(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: TransferProjectDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.projects.transfer(
      request.auth!.user,
      id,
      input.newPmUserId,
      input.reason,
      this.requestId(response),
    );
  }

  @Post(':id/visits')
  @RequirePermissions()
  @RequireRoles('PROJECT_MANAGER', 'ASSOCIATE_DIRECTOR_GCP')
  visit(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CreateVisitDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.projects.createVisit(
      request.auth!.user,
      id,
      input,
      this.requestId(response),
    );
  }

  @Post('visits/:visitId/timeline')
  @RequirePermissions('Edit')
  @RequireRoles('PROJECT_MANAGER')
  timeline(
    @Req() request: AuthenticatedRequest,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() input: TimelineOverrideDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.projects.overrideTimeline(
      request.auth!.user,
      visitId,
      input.workingDays,
      input.reason,
      this.requestId(response),
    );
  }

  @Post('visits/:visitId/milestones')
  @RequirePermissions()
  @RequireRoles('PROJECT_MANAGER', 'ASSOCIATE_DIRECTOR_GCP', 'QMS')
  milestone(
    @Req() request: AuthenticatedRequest,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() input: MilestoneDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.projects.milestone(
      request.auth!.user,
      visitId,
      input.milestoneType,
      this.requestId(response),
    );
  }

  @Post('milestones/:milestoneId/corrections')
  @RequirePermissions()
  @RequireRoles('ASSOCIATE_DIRECTOR_GCP', 'QMS')
  correction(
    @Req() request: AuthenticatedRequest,
    @Param('milestoneId', ParseUUIDPipe) milestoneId: string,
    @Body() input: MilestoneCorrectionDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.projects.correctMilestone(
      request.auth!.user,
      milestoneId,
      input.reason,
      this.requestId(response),
    );
  }
}
