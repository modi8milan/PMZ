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
  CreateVisitDto,
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
  'Visit End Date',
  'Report from Monitor / Auditor',
  'First Draft Submitted',
  'Report Shared to Sponsor',
  'Sponsor Deadline',
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

function exportRow(row: TrackerRow) {
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
    row.visitEndDate,
    row.reportFromMonitor,
    row.firstDraftSubmittedAt,
    row.reportSharedToSponsorAt,
    row.sponsorDeadlineDate,
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

  async options() {
    const rows = await this.projects.options();
    return {
      projectManagers: rows.filter((row) => row.role === 'PROJECT_MANAGER'),
      monitors: rows.filter((row) => row.role === 'CRA_MONITOR'),
    };
  }

  async create(user: AuthUser, input: CreateProjectDto, requestId?: string) {
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
    const calendar = input.visitEndDate
      ? await this.projects.calendar(input.visitEndDate)
      : new Map<string, boolean>();
    const deadline = input.visitEndDate
      ? this.businessTime.deadline(input.visitEndDate, 5, calendar)
      : null;
    const visit = await this.projects.createVisit(
      projectId,
      input,
      user.id,
      deadline,
    );
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
    const rows = result.items.map(exportRow);
    return format === 'csv'
      ? csvExport(headings, rows)
      : xlsxExport(headings, rows);
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
