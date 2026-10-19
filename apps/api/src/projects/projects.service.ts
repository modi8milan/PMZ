import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthRepository } from '../auth/auth.repository.js';
import type { AuthUser } from '../auth/auth.types.js';
import type {
  CreateProjectDto,
  CreateClientDto,
  CreateVisitDto,
  CreateVisitTypeDto,
  UpdateVisitAssignmentDto,
  ProjectQueryDto,
  TrackerQueryDto,
} from './projects.dto.js';
import { ProjectsRepository } from './projects.repository.js';
import { BusinessTimeService } from './business-time.service.js';
import { csvExport, xlsxExport } from './tracker-export.js';
import {
  projectAccess,
  type ProjectAccess,
  type ProjectRow,
  type ProjectStatus,
  type MilestoneType,
  type TrackerRow,
} from './projects.types.js';

const headings = [
  'Sr. No.',
  'Sponsor',
  'Client Code',
  'ZENOVEL Project ID',
  'Project ID',
  'Title',
  'Project Status',
  'Project Detail',
  'Regulatory Submission Status / Details',
  'CRO',
  'Facility / Site',
  'Visit',
  'Visit Type',
  'Visit Status',
  'Report Status',
  'CAPA Status',
  'Monitor',
  'Agenda Shared',
  'Visit Start Date',
  'Visit End Date',
  'Report from Monitor / Auditor',
  'First Draft Submitted',
  'Report Shared to Sponsor',
  'Sponsor Deadline',
  'Sponsor-Report Timeline Status',
  'Sponsor Report Overdue',
  'Deviation Required',
  'Deviation Reported',
  'Sponsor Approval',
  'Signed Report Shared',
  'MFR to CRO',
  'CAPA from CRO',
  'CAPA Received Date',
  'Study Result',
  'Source Documents',
  'QMS Archival',
  'Comments',
  'Final Archival Date',
];

export type TimelineStatus = 'MET' | 'MISSED' | 'PENDING' | 'NOT APPLICABLE';

export function timelineStatus(
  row: TrackerRow,
  businessDate: string,
  sharedBusinessDate?: string,
): TimelineStatus {
  if (row.sponsorReportOverdue) return 'MISSED';
  if (!row.visitEndDate || !row.sponsorDeadlineDate) return 'NOT APPLICABLE';
  if (row.reportSharedToSponsorAt) {
    return (sharedBusinessDate ?? row.reportSharedToSponsorAt.slice(0, 10)) <=
      row.sponsorDeadlineDate
      ? 'MET'
      : 'MISSED';
  }
  return businessDate > row.sponsorDeadlineDate ? 'MISSED' : 'PENDING';
}

function exportRow(row: TrackerRow, status: TimelineStatus) {
  return [
    Number(row.serialNo),
    row.sponsorName,
    row.clientCode,
    row.inHouseProjectId,
    row.sponsorProjectId,
    row.title,
    row.status,
    row.projectDetail,
    row.regulatorySubmissionDetails,
    row.croName,
    row.clinicalSite ?? row.bioanalyticalFacility,
    row.visitSequence,
    row.visitType,
    row.visitStatus,
    row.reportStatus,
    row.capaStatus,
    row.monitorName,
    row.agendaShared,
    row.visitStartDate,
    row.visitEndDate,
    row.reportFromMonitor,
    row.firstDraftSubmittedAt,
    row.reportSharedToSponsorAt,
    row.sponsorDeadlineDate,
    status,
    row.sponsorReportOverdue,
    row.deviationRequired,
    row.deviationReported,
    row.sponsorApproval,
    row.signedReportSharedAt,
    row.mfrToCro,
    row.capaFromCro,
    row.capaReceivedDate,
    row.studyResult,
    row.sourceDocumentsStatus,
    row.qmsArchivalSubmission,
    row.comments,
    row.finalArchivalDate,
  ];
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly projects: ProjectsRepository,
    private readonly audit: AuthRepository,
    private readonly businessTime: BusinessTimeService,
  ) {}

  private access(user: AuthUser): ProjectAccess {
    const access = projectAccess(user);
    if (!access) throw new ForbiddenException();
    return access;
  }

  private redact<T extends ProjectRow>(row: T, access: ProjectAccess) {
    if (!access.redactSponsor) return row;
    const safe: Partial<T> = { ...row };
    delete safe.sponsorName;
    delete safe.sponsorProjectId;
    return safe;
  }

  private async requireProject(user: AuthUser, projectId: string) {
    const access = this.access(user);
    const project = await this.projects.find(access, projectId);
    if (!project) throw new NotFoundException();
    return { access, project };
  }

  async options(user: AuthUser) {
    const includeInactive = user.roles.includes('ASSOCIATE_DIRECTOR_GCP');
    const [rows, clients, visitTypes] = await Promise.all([
      this.projects.options(),
      this.projects.clients(includeInactive),
      this.projects.visitTypes(includeInactive),
    ]);
    return {
      projectManagers: rows.filter((row) => row.role === 'PROJECT_MANAGER'),
      monitors: rows.filter((row) => row.role === 'CRA_MONITOR'),
      clients,
      visitTypes,
    };
  }

  visitTypes(user: AuthUser) {
    return this.projects.visitTypes(
      user.roles.includes('ASSOCIATE_DIRECTOR_GCP'),
    );
  }

  clients(user: AuthUser) {
    if (user.roles.includes('CRA_MONITOR')) throw new ForbiddenException();
    return this.projects.clients(user.roles.includes('ASSOCIATE_DIRECTOR_GCP'));
  }

  async createVisitType(
    user: AuthUser,
    input: CreateVisitTypeDto,
    requestId?: string,
  ) {
    this.requireAssociateDirector(user);
    try {
      const value = await this.projects.createVisitType(input, user.id);
      await this.audit.event({
        actorUserId: user.id,
        eventType: 'visit_type_created',
        outcome: 'success',
        requestId,
        context: { visitTypeId: value.id },
      });
      return value;
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException(
          'A visit type with this name already exists.',
        );
      throw error;
    }
  }

  async updateVisitType(
    user: AuthUser,
    id: string,
    input: { displayName?: string; active?: boolean },
    requestId?: string,
  ) {
    this.requireAssociateDirector(user);
    if (input.displayName === undefined && input.active === undefined)
      throw new BadRequestException('Provide a name or active status.');
    try {
      const value = await this.projects.updateVisitType(id, input, user.id);
      if (!value) throw new NotFoundException();
      await this.audit.event({
        actorUserId: user.id,
        eventType: 'visit_type_updated',
        outcome: 'success',
        requestId,
        context: { visitTypeId: id, active: value.active },
      });
      return value;
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException(
          'A visit type with this name already exists.',
        );
      throw error;
    }
  }

  async createClient(
    user: AuthUser,
    input: CreateClientDto,
    requestId?: string,
  ) {
    this.requireAssociateDirector(user);
    try {
      const value = await this.projects.createClient(input, user.id);
      await this.audit.event({
        actorUserId: user.id,
        eventType: 'client_created',
        outcome: 'success',
        requestId,
        context: { clientId: value.id },
      });
      return value;
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        const constraint = (error as { constraint?: string }).constraint ?? '';
        if (constraint.includes('normalized_code'))
          throw new ConflictException(
            'A client with this code already exists.',
          );
        throw new ConflictException('A client with this name already exists.');
      }
      throw error;
    }
  }

  async updateClient(
    user: AuthUser,
    id: string,
    input: { name?: string; code?: string; active?: boolean },
    requestId?: string,
  ) {
    this.requireAssociateDirector(user);
    if (
      input.name === undefined &&
      input.code === undefined &&
      input.active === undefined
    )
      throw new BadRequestException('Provide client details or active status.');
    try {
      const value = await this.projects.updateClient(id, input, user.id);
      if (!value) throw new NotFoundException();
      await this.audit.event({
        actorUserId: user.id,
        eventType: 'client_updated',
        outcome: 'success',
        requestId,
        context: { clientId: id, active: value.active },
      });
      return value;
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        const constraint = (error as { constraint?: string }).constraint ?? '';
        if (constraint.includes('normalized_code'))
          throw new ConflictException(
            'A client with this code already exists.',
          );
        throw new ConflictException('A client with this name already exists.');
      }
      throw error;
    }
  }

  private requireAssociateDirector(user: AuthUser) {
    if (!user.roles.includes('ASSOCIATE_DIRECTOR_GCP'))
      throw new ForbiddenException();
  }

  async create(user: AuthUser, input: CreateProjectDto, requestId?: string) {
    if (!(await this.projects.activeClient(input.clientId)))
      throw new BadRequestException('The selected client is unavailable.');
    if (!(await this.projects.isEligible(input.pmUserId, 'PROJECT_MANAGER')))
      throw new BadRequestException(
        'The selected project manager is unavailable.',
      );
    if (
      input.provisionalMonitorId &&
      !(await this.projects.isEligible(
        input.provisionalMonitorId,
        'CRA_MONITOR',
      ))
    )
      throw new BadRequestException(
        'The selected provisional monitor is unavailable.',
      );
    try {
      const project = await this.projects.create(input, user.id);
      if (!project)
        throw new BadRequestException('The selected client is unavailable.');
      await this.audit.event({
        actorUserId: user.id,
        subjectUserId: input.pmUserId,
        eventType: 'project_created',
        outcome: 'success',
        requestId,
        context: { projectId: project.id, serialNo: project.serialNo },
      });
      await this.audit.event({
        actorUserId: user.id,
        subjectUserId: input.pmUserId,
        eventType: 'project_assignment_created',
        outcome: 'success',
        requestId,
        context: { projectId: project.id },
      });
      return project;
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException();
      throw error;
    }
  }

  async list(user: AuthUser, query: ProjectQueryDto) {
    const access = this.access(user);
    if (access.redactSponsor && (query.sponsor || query.projectId))
      throw new ForbiddenException();
    const result = await this.projects.list(access, query);
    return {
      ...result,
      items: result.items.map((row) => this.redact(row, access)),
    };
  }

  async detail(user: AuthUser, projectId: string) {
    const { access, project } = await this.requireProject(user, projectId);
    return this.redact(project, access);
  }

  async dashboard(user: AuthUser) {
    const access = this.access(user);
    await this.refreshOverdue();
    return this.projects.dashboard(access);
  }

  async respond(
    user: AuthUser,
    projectId: string,
    decision: 'accept' | 'decline' | 'return',
    reason: string | undefined,
    requestId?: string,
  ) {
    if (!user.roles.includes('PROJECT_MANAGER')) throw new ForbiddenException();
    if (decision !== 'accept' && !reason?.trim())
      throw new BadRequestException('A reason is required.');
    const result = await this.projects.respond(
      projectId,
      user.id,
      decision,
      reason?.trim(),
    );
    if (!result) throw new ConflictException();
    await this.audit.event({
      actorUserId: user.id,
      eventType: `project_assignment_${
        { accept: 'accepted', decline: 'declined', return: 'returned' }[
          decision
        ]
      }`,
      outcome: 'success',
      requestId,
      reason: reason?.trim() ?? null,
      context: {
        projectId,
        beforeState: result.previousState,
        afterState: result.nextState,
      },
    });
    return { projectId, assignmentState: result.nextState };
  }

  async status(
    user: AuthUser,
    projectId: string,
    status: ProjectStatus,
    reason: string,
    requestId?: string,
  ) {
    const { project } = await this.requireProject(user, projectId);
    if (
      !user.roles.some((role) =>
        ['PROJECT_MANAGER', 'ASSOCIATE_DIRECTOR_GCP'].includes(role),
      )
    )
      throw new ForbiddenException();
    if (user.roles.includes('PROJECT_MANAGER') && project.pmUserId !== user.id)
      throw new ForbiddenException();
    const result = await this.projects.setStatus(
      projectId,
      status,
      user.id,
      reason,
    );
    if (!result) throw new NotFoundException();
    await this.audit.event({
      actorUserId: user.id,
      eventType: 'project_status_changed',
      outcome: 'success',
      requestId,
      reason,
      context: {
        projectId,
        beforeStatus: result.previousStatus,
        afterStatus: status,
      },
    });
    return { projectId, status };
  }

  async transfer(
    user: AuthUser,
    projectId: string,
    newPmUserId: string,
    reason: string,
    requestId?: string,
  ) {
    if (
      !user.roles.some((role) =>
        ['ASSOCIATE_DIRECTOR_GCP', 'SYSTEM_ADMINISTRATOR'].includes(role),
      )
    )
      throw new ForbiddenException();
    if (!(await this.projects.isEligible(newPmUserId, 'PROJECT_MANAGER')))
      throw new BadRequestException(
        'The selected project manager is unavailable.',
      );
    const result = await this.projects.transfer(
      projectId,
      newPmUserId,
      user.id,
      reason,
    );
    if (!result) throw new ConflictException();
    await this.audit.event({
      actorUserId: user.id,
      subjectUserId: newPmUserId,
      eventType: 'project_ownership_transferred',
      outcome: 'success',
      requestId,
      reason,
      context: {
        projectId,
        previousPmUserId: result.previousPmUserId,
        newPmUserId,
      },
    });
    return { projectId, assignmentState: 'PENDING' };
  }

  async createVisit(
    user: AuthUser,
    projectId: string,
    input: CreateVisitDto,
    requestId?: string,
  ) {
    const { project } = await this.requireProject(user, projectId);
    if (
      !user.roles.some((role) =>
        ['PROJECT_MANAGER', 'ASSOCIATE_DIRECTOR_GCP'].includes(role),
      )
    )
      throw new ForbiddenException();
    if (user.roles.includes('PROJECT_MANAGER') && project.pmUserId !== user.id)
      throw new ForbiddenException();
    if (
      input.monitorUserId &&
      !(await this.projects.isEligible(input.monitorUserId, 'CRA_MONITOR'))
    )
      throw new BadRequestException('The selected monitor is unavailable.');
    if (input.monitorUserId && (!input.visitStartDate || !input.visitEndDate))
      throw new BadRequestException(
        'Visit start and end dates are required when assigning a monitor.',
      );
    if (
      input.visitStartDate &&
      input.visitEndDate &&
      input.visitEndDate < input.visitStartDate
    )
      throw new BadRequestException(
        'Visit End Date cannot be earlier than Visit Start Date.',
      );
    const visitType = await this.projects.activeVisitType(input.visitTypeId);
    if (!visitType)
      throw new BadRequestException('The selected visit type is unavailable.');
    const calendar = input.visitEndDate
      ? await this.projects.calendar(input.visitEndDate)
      : new Map<string, boolean>();
    const deadline = input.visitEndDate
      ? this.businessTime.deadline(input.visitEndDate, 5, calendar)
      : null;
    let visit;
    try {
      visit = await this.projects.createVisit(
        projectId,
        input,
        user.id,
        deadline,
        visitType.displayName,
      );
    } catch (error) {
      this.throwMonitorConflict(error);
      throw error;
    }
    if (!visit) throw new NotFoundException();
    await this.audit.event({
      actorUserId: user.id,
      eventType: 'project_visit_created',
      outcome: 'success',
      requestId,
      context: {
        projectId,
        visitId: visit.id,
        visitSequence: visit.visitSequence,
      },
    });
    return { ...visit, sponsorDeadlineDate: deadline };
  }

  async updateVisitDates(
    user: AuthUser,
    visitId: string,
    input: { visitStartDate?: string; visitEndDate?: string; reason: string },
    requestId?: string,
  ) {
    const visit = await this.projects.visitForUpdate(visitId);
    if (!visit) throw new NotFoundException();
    const { project } = await this.requireProject(user, visit.projectId);
    if (
      !user.roles.some((role) =>
        ['PROJECT_MANAGER', 'ASSOCIATE_DIRECTOR_GCP'].includes(role),
      )
    )
      throw new ForbiddenException();
    if (user.roles.includes('PROJECT_MANAGER') && project.pmUserId !== user.id)
      throw new ForbiddenException();
    const startDate = input.visitStartDate ?? visit.visitStartDate;
    const endDate = input.visitEndDate ?? visit.visitEndDate;
    if (startDate && endDate && endDate < startDate)
      throw new BadRequestException(
        'Visit End Date cannot be earlier than Visit Start Date.',
      );
    const calendar = endDate
      ? await this.projects.calendar(endDate)
      : new Map<string, boolean>();
    const deadline = endDate
      ? this.businessTime.deadline(
          endDate,
          visit.sponsorTimelineWorkingDays,
          calendar,
        )
      : null;
    let previous;
    try {
      previous = await this.projects.updateVisitDates(
        visitId,
        startDate,
        endDate,
        deadline,
        user.id,
        input.reason,
      );
    } catch (error) {
      this.throwMonitorConflict(error);
      throw error;
    }
    if (!previous) throw new NotFoundException();
    await this.audit.event({
      actorUserId: user.id,
      eventType: 'project_visit_dates_changed',
      outcome: 'success',
      requestId,
      reason: input.reason,
      context: {
        projectId: visit.projectId,
        visitId,
        beforeStartDate: previous.visitStartDate,
        afterStartDate: startDate,
        beforeEndDate: previous.visitEndDate,
        afterEndDate: endDate,
        beforeDeadline: previous.sponsorDeadlineDate,
        afterDeadline: deadline,
      },
    });
    return {
      visitId,
      visitStartDate: startDate,
      visitEndDate: endDate,
      sponsorDeadlineDate: deadline,
    };
  }

  async monitorAvailability(
    user: AuthUser,
    monitorUserId: string,
    startDate: string,
    endDate: string,
    excludeVisitId?: string,
  ) {
    this.access(user);
    if (endDate < startDate)
      throw new BadRequestException(
        'Visit End Date cannot be earlier than Visit Start Date.',
      );
    const conflict = await this.projects.availability(
      monitorUserId,
      startDate,
      endDate,
      excludeVisitId,
    );
    return {
      available: !conflict,
      ...(conflict
        ? {
            conflict: {
              visitStartDate: conflict.visitStartDate,
              visitEndDate: conflict.visitEndDate,
            },
          }
        : {}),
    };
  }

  async updateVisitAssignment(
    user: AuthUser,
    visitId: string,
    input: UpdateVisitAssignmentDto,
    requestId?: string,
  ) {
    const visit = await this.projects.visitForUpdate(visitId);
    if (!visit) throw new NotFoundException();
    const { project } = await this.requireProject(user, visit.projectId);
    if (
      !user.roles.some((role) =>
        ['PROJECT_MANAGER', 'ASSOCIATE_DIRECTOR_GCP'].includes(role),
      )
    )
      throw new ForbiddenException();
    if (user.roles.includes('PROJECT_MANAGER') && project.pmUserId !== user.id)
      throw new ForbiddenException();
    const monitorUserId = input.monitorUserId ?? null;
    if (
      monitorUserId &&
      !(await this.projects.isEligible(monitorUserId, 'CRA_MONITOR'))
    )
      throw new BadRequestException('The selected monitor is unavailable.');
    let result;
    try {
      result = await this.projects.updateVisitMonitor(
        visitId,
        monitorUserId,
        user.id,
        input.reason,
      );
    } catch (error) {
      this.throwMonitorConflict(error);
      throw error;
    }
    if (!result) throw new NotFoundException();
    if (result.unchanged)
      throw new ConflictException('The selected monitor is already assigned.');
    await this.audit.event({
      actorUserId: user.id,
      subjectUserId: monitorUserId ?? result.previousMonitorId ?? undefined,
      eventType: 'project_visit_monitor_changed',
      outcome: 'success',
      requestId,
      reason: input.reason,
      context: {
        projectId: result.projectId,
        visitId,
        previousMonitorId: result.previousMonitorId,
        newMonitorId: monitorUserId,
      },
    });
    return { success: true, monitorUserId };
  }

  private throwMonitorConflict(error: unknown): void {
    const value = error as {
      code?: string;
      conflict?: { visitStartDate: string; visitEndDate: string };
    };
    if (value.code !== 'MONITOR_SCHEDULE_CONFLICT') return;
    const range = value.conflict
      ? ` Existing assignment: ${value.conflict.visitStartDate} to ${value.conflict.visitEndDate}.`
      : '';
    throw new ConflictException(
      `The selected monitor already has an overlapping visit assignment.${range}`,
    );
  }

  async tracker(user: AuthUser, query: TrackerQueryDto) {
    if (
      !user.roles.some((role) =>
        [
          'PROJECT_MANAGER',
          'ASSOCIATE_DIRECTOR_GCP',
          'QMS',
          'DIRECTOR',
          'DIRECTOR_OPERATIONS',
        ].includes(role),
      )
    )
      throw new ForbiddenException();
    await this.refreshOverdue();
    const access = this.access(user);
    return this.projects.tracker(access, query);
  }

  async export(user: AuthUser, query: TrackerQueryDto, format: 'csv' | 'xlsx') {
    const access = this.access(user);
    const result = await this.projects.tracker(access, query, false);
    const businessDate = this.businessTime.businessDate();
    const statusFor = (row: TrackerRow) =>
      timelineStatus(
        row,
        businessDate,
        row.reportSharedToSponsorAt
          ? this.businessTime.businessDate(
              new Date(row.reportSharedToSponsorAt),
            )
          : undefined,
      );
    const statuses = result.items.map(statusFor);
    const rows = result.items.map((row, index) =>
      exportRow(row, statuses[index] ?? 'NOT APPLICABLE'),
    );
    return format === 'csv'
      ? csvExport(headings, rows)
      : xlsxExport(headings, rows, statuses);
  }

  async overrideTimeline(
    user: AuthUser,
    visitId: string,
    workingDays: number,
    reason: string,
    requestId?: string,
  ) {
    if (!user.roles.includes('PROJECT_MANAGER')) throw new ForbiddenException();
    const visit = await this.projects.visitForUpdate(visitId);
    if (!visit) throw new NotFoundException();
    const { project } = await this.requireProject(user, visit.projectId);
    if (project.pmUserId !== user.id) throw new ForbiddenException();
    const calendar = visit.visitEndDate
      ? await this.projects.calendar(visit.visitEndDate)
      : new Map<string, boolean>();
    const deadline = visit.visitEndDate
      ? this.businessTime.deadline(visit.visitEndDate, workingDays, calendar)
      : null;
    const previous = await this.projects.overrideTimeline(
      visitId,
      workingDays,
      deadline,
      user.id,
      reason,
    );
    if (!previous) throw new NotFoundException();
    await this.audit.event({
      actorUserId: user.id,
      eventType: 'project_timeline_overridden',
      outcome: 'success',
      requestId,
      reason,
      context: {
        projectId: visit.projectId,
        visitId,
        beforeWorkingDays: previous.sponsorTimelineWorkingDays,
        afterWorkingDays: workingDays,
        beforeDeadline: previous.sponsorDeadlineDate,
        afterDeadline: deadline,
      },
    });
    return { visitId, workingDays, sponsorDeadlineDate: deadline };
  }

  async milestone(
    user: AuthUser,
    visitId: string,
    milestoneType: MilestoneType,
    requestId?: string,
  ) {
    const visit = await this.projects.visitForUpdate(visitId);
    if (!visit) throw new NotFoundException();
    await this.requireProject(user, visit.projectId);
    if (
      !user.roles.some((role) =>
        ['PROJECT_MANAGER', 'ASSOCIATE_DIRECTOR_GCP', 'QMS'].includes(role),
      )
    )
      throw new ForbiddenException();
    try {
      const milestone = await this.projects.milestone(
        visitId,
        milestoneType,
        user.id,
        this.businessTime.businessDate(),
      );
      if (!milestone) throw new NotFoundException();
      await this.audit.event({
        actorUserId: user.id,
        eventType: 'project_milestone_recorded',
        outcome: 'success',
        requestId,
        context: { projectId: milestone.projectId, visitId, milestoneType },
      });
      return milestone;
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException();
      throw error;
    }
  }

  async correctMilestone(
    user: AuthUser,
    milestoneId: string,
    reason: string,
    requestId?: string,
  ) {
    if (
      !user.roles.some((role) =>
        ['ASSOCIATE_DIRECTOR_GCP', 'QMS'].includes(role),
      )
    )
      throw new ForbiddenException();
    const result = await this.projects.correctMilestone(
      milestoneId,
      user.id,
      reason,
    );
    if (!result) throw new NotFoundException();
    await this.audit.event({
      actorUserId: user.id,
      eventType: 'project_milestone_correction_recorded',
      outcome: 'success',
      requestId,
      reason,
      context: { projectId: result.projectId, milestoneId },
    });
    return { milestoneId, corrected: true };
  }

  notifications(user: AuthUser) {
    return this.projects.notifications(user.id);
  }

  private async refreshOverdue() {
    await this.projects.raiseOverdue(this.businessTime.businessDate());
  }
}
