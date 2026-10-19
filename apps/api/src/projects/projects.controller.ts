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
  CreateClientDto,
  CreateProjectDto,
  CreateVisitDto,
  CreateVisitTypeDto,
  ExportQueryDto,
  MilestoneCorrectionDto,
  MilestoneDto,
  ProjectQueryDto,
  ProjectStatusDto,
  TimelineOverrideDto,
  TrackerQueryDto,
  TransferProjectDto,
  UpdateClientDto,
  UpdateVisitDatesDto,
  UpdateVisitTypeDto,
  UpdateVisitAssignmentDto,
  MonitorAvailabilityQueryDto,
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
  options(@Req() request: AuthenticatedRequest) {
    return this.projects.options(request.auth!.user);
  }

  @Get('notifications')
  notifications(@Req() request: AuthenticatedRequest) {
    return this.projects.notifications(request.auth!.user);
  }

  @Get('visit-types')
  visitTypes(@Req() request: AuthenticatedRequest) {
    return this.projects.visitTypes(request.auth!.user);
  }

  @Post('visit-types')
  @RequirePermissions()
  @RequireRoles('ASSOCIATE_DIRECTOR_GCP')
  createVisitType(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateVisitTypeDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.projects.createVisitType(
      request.auth!.user,
      input,
      this.requestId(response),
    );
  }

  @Patch('visit-types/:id')
  @RequirePermissions()
  @RequireRoles('ASSOCIATE_DIRECTOR_GCP')
  updateVisitType(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateVisitTypeDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.projects.updateVisitType(
      request.auth!.user,
      id,
      input,
      this.requestId(response),
    );
  }

  @Get('clients')
  @RequireRoles(
    'PROJECT_MANAGER',
    'ASSOCIATE_DIRECTOR_GCP',
    'QMS',
    'DIRECTOR',
    'DIRECTOR_OPERATIONS',
  )
  clients(@Req() request: AuthenticatedRequest) {
    return this.projects.clients(request.auth!.user);
  }

  @Post('clients')
  @RequirePermissions()
  @RequireRoles('ASSOCIATE_DIRECTOR_GCP')
  createClient(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateClientDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.projects.createClient(
      request.auth!.user,
      input,
      this.requestId(response),
    );
  }

  @Patch('clients/:id')
  @RequirePermissions()
  @RequireRoles('ASSOCIATE_DIRECTOR_GCP')
  updateClient(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateClientDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.projects.updateClient(
      request.auth!.user,
      id,
      input,
      this.requestId(response),
    );
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

  @Get('visits/monitor-availability')
  @RequirePermissions()
  @RequireRoles('PROJECT_MANAGER', 'ASSOCIATE_DIRECTOR_GCP')
  monitorAvailability(
    @Req() request: AuthenticatedRequest,
    @Query() input: MonitorAvailabilityQueryDto,
  ) {
    return this.projects.monitorAvailability(
      request.auth!.user,
      input.monitorUserId,
      input.visitStartDate,
      input.visitEndDate,
      input.excludeVisitId,
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

  @Patch('visits/:visitId/dates')
  @RequirePermissions()
  @RequireRoles('PROJECT_MANAGER', 'ASSOCIATE_DIRECTOR_GCP')
  visitDates(
    @Req() request: AuthenticatedRequest,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() input: UpdateVisitDatesDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.projects.updateVisitDates(
      request.auth!.user,
      visitId,
      input,
      this.requestId(response),
    );
  }

  @Patch('visits/:visitId/assignment')
  @RequirePermissions()
  @RequireRoles('PROJECT_MANAGER', 'ASSOCIATE_DIRECTOR_GCP')
  visitAssignment(
    @Req() request: AuthenticatedRequest,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() input: UpdateVisitAssignmentDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.projects.updateVisitAssignment(
      request.auth!.user,
      visitId,
      input,
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
