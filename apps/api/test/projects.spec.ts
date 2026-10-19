import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { validate } from 'class-validator';
import { AuthService } from '../src/auth/auth.service.js';
import { AuthRepository } from '../src/auth/auth.repository.js';
import { AuthenticationGuard } from '../src/auth/auth.guard.js';
import { PermissionGuard } from '../src/auth/permission.guard.js';
import { AuthorizationService } from '../src/auth/authorization.service.js';
import type {
  AuthSession,
  AuthUser,
  SecurityEvent,
} from '../src/auth/auth.types.js';
import type { Environment } from '../src/config/environment.js';
import { SafeLogger } from '../src/common/safe-logger.js';
import { setup } from '../src/setup.js';
import { tokenHash } from '../src/security/security.crypto.js';
import { ProjectsController } from '../src/projects/projects.controller.js';
import {
  CreateProjectDto,
  MilestoneCorrectionDto,
  MilestoneDto,
  TrackerQueryDto,
  TimelineOverrideDto,
} from '../src/projects/projects.dto.js';
import { ProjectsService } from '../src/projects/projects.service.js';
import { projectAccess } from '../src/projects/projects.types.js';
import type { ProjectsRepository } from '../src/projects/projects.repository.js';
import { BusinessTimeService } from '../src/projects/business-time.service.js';
import { OverdueProcessor } from '../src/projects/overdue.processor.js';
import { csvExport, xlsxExport } from '../src/projects/tracker-export.js';

const projectConfig = new ConfigService<Environment, true>({
  BUSINESS_TIME_ZONE: 'Asia/Kolkata',
  OVERDUE_PROCESSING_INTERVAL_MS: 60_000,
} as Environment);
const businessTime = new BusinessTimeService(projectConfig);

function projectsService(
  repository: FakeProjectsRepository,
  audit: FakeAuditRepository = new FakeAuditRepository(),
) {
  return new ProjectsService(
    repository as unknown as ProjectsRepository,
    audit as unknown as AuthRepository,
    businessTime,
  );
}

const authConfig = new ConfigService<Environment, true>({
  PASSWORD_EXPIRY_DAYS: 30,
  PASSWORD_HISTORY_COUNT: 5,
  SESSION_IDLE_MINUTES: 30,
  SESSION_ABSOLUTE_HOURS: 8,
  LOGIN_MAX_FAILURES: 5,
  LOCKOUT_MINUTES: 15,
  RESET_TOKEN_MINUTES: 30,
  MFA_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
} as Environment);

function actor(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: '00000000-0000-4000-8000-000000000101',
    username: 'project.user',
    fullName: 'Project User',
    email: null,
    departmentId: null,
    status: 'active',
    passwordHash: '',
    passwordExpiresAt: new Date(Date.now() + 86_400_000),
    mustChangePassword: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    mfaSecretEncrypted: null,
    mfaEnabled: false,
    mfaRequired: false,
    authVersion: 1,
    roles: ['PROJECT_MANAGER'],
    permissions: ['View', 'Edit', 'Export'],
    ...overrides,
  };
}

const project = {
  id: '00000000-0000-4000-8000-000000000201',
  serialNo: '1',
  inHouseProjectId: 'ZEN-001',
  sponsorProjectId: 'SPONSOR-SECRET-1',
  sponsorName: 'Confidential Sponsor',
  clientCode: 'CLIENT-01',
  title: 'Study title',
  projectDetail: null,
  regulatorySubmissionDetails: null,
  croName: null,
  clinicalSite: null,
  bioanalyticalFacility: null,
  receiptDate: '2026-10-15',
  tentativeStartDate: null,
  category: null,
  status: 'PRE_INITIATION' as const,
  assignmentState: 'PENDING',
  pmUserId: '00000000-0000-4000-8000-000000000101',
  pmName: 'Project User',
  provisionalMonitorId: '00000000-0000-4000-8000-000000000102',
  provisionalMonitorName: 'Monitor User',
  visitCount: 0,
  createdAt: '2026-10-15T00:00:00.000Z',
};

class FakeProjectsRepository {
  projects = [{ ...project }];
  notificationCount = 0;
  accepted = false;
  visits: Array<{
    id: string;
    projectId: string;
    visitSequence: number;
    deadline: string | null;
  }> = [];
  override: { workingDays: number; deadline: string | null } | null = null;
  overdueRows: Array<{
    visitId: string;
    projectId: string;
    pmUserId: string | null;
  }> = [];
  overdueBusinessDates: string[] = [];
  lastMilestoneType: string | null = null;
  async options() {
    return [];
  }
  async isEligible() {
    return true;
  }
  async create() {
    this.notificationCount += 1;
    return { id: project.id, serialNo: project.serialNo };
  }
  async list() {
    return { items: this.projects, total: 1, page: 1, pageSize: 25 };
  }
  async find(access: { organizationWide: boolean; userId: string }) {
    return access.organizationWide ||
      access.userId === this.projects[0]!.pmUserId
      ? this.projects[0]!
      : null;
  }
  async dashboard() {
    return {
      total: 1,
      preInitiation: 1,
      active: 0,
      completed: 0,
      archived: 0,
      visits: 0,
      overdue: 0,
      deviationRequired: 0,
    };
  }
  async respond() {
    this.accepted = true;
    return {
      projectId: project.id,
      previousState: 'PENDING',
      nextState: 'ACCEPTED',
    };
  }
  async transfer(_projectId: string, newPmUserId: string) {
    const previousPmUserId = this.projects[0]!.pmUserId;
    this.projects[0]!.pmUserId = newPmUserId;
    return { previousPmUserId, newPmUserId };
  }
  async notifications() {
    return [];
  }
  async calendar() {
    return new Map<string, boolean>();
  }
  async createVisit(
    projectId: string,
    _input: unknown,
    _actorId: string,
    deadline: string | null,
  ) {
    const visit = {
      id: `00000000-0000-4000-8000-${String(this.visits.length + 1).padStart(12, '0')}`,
      projectId,
      visitSequence: this.visits.length + 1,
      deadline,
    };
    this.visits.push(visit);
    return visit;
  }
  async visitForUpdate() {
    return {
      id: '00000000-0000-4000-8000-000000000401',
      projectId: project.id,
      visitEndDate: '2026-10-16',
      sponsorTimelineWorkingDays: 5,
      sponsorDeadlineDate: '2026-10-23',
    };
  }
  async overrideTimeline(
    _visitId: string,
    workingDays: number,
    deadline: string | null,
  ) {
    this.override = { workingDays, deadline };
    return {
      id: '00000000-0000-4000-8000-000000000401',
      projectId: project.id,
      visitEndDate: '2026-10-16',
      sponsorTimelineWorkingDays: 5,
      sponsorDeadlineDate: '2026-10-23',
    };
  }
  async milestone(_visitId: string, type: string) {
    this.lastMilestoneType = type;
    return {
      id: '00000000-0000-4000-8000-000000000402',
      occurredAt: new Date().toISOString(),
      projectId: project.id,
      milestoneType: type,
      late: false,
    };
  }
  async correctMilestone() {
    return { projectId: project.id };
  }
  async raiseOverdue(businessDate: string) {
    this.overdueBusinessDates.push(businessDate);
    const rows = this.overdueRows;
    this.overdueRows = [];
    return rows;
  }
}

class FakeAuditRepository {
  events: SecurityEvent[] = [];
  async event(value: SecurityEvent) {
    this.events.push(value);
  }
}

describe('Stage 3 project rules', () => {
  it('calculates five working days after a visit and excludes weekends', () => {
    assert.equal(businessTime.deadline('2026-10-16', 5), '2026-10-23');
  });

  it('honors configured non-working and working calendar exceptions', () => {
    const calendar = new Map([
      ['2026-10-19', false],
      ['2026-10-24', true],
    ]);
    assert.equal(
      businessTime.deadline('2026-10-16', 5, calendar),
      '2026-10-24',
    );
  });

  it('uses the Kolkata business date across the midnight boundary', () => {
    assert.equal(
      businessTime.businessDate(new Date('2026-10-15T18:29:59.999Z')),
      '2026-10-15',
    );
    assert.equal(
      businessTime.businessDate(new Date('2026-10-15T18:30:00.000Z')),
      '2026-10-16',
    );
  });

  it('keeps project, visit, report, and CAPA validation fields separate', async () => {
    const input = Object.assign(new CreateProjectDto(), {
      inHouseProjectId: 'ZEN-001',
      sponsorProjectId: 'SP-1',
      sponsorName: 'Sponsor',
      clientCode: 'C-1',
      title: 'Trial',
      receiptDate: 'not-a-date',
      pmUserId: 'not-a-uuid',
      visitStatus: 'COMPLETED',
    });
    const errors = await validate(input, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    assert.ok(errors.some((error) => error.property === 'receiptDate'));
    assert.ok(errors.some((error) => error.property === 'pmUserId'));
    assert.ok(errors.some((error) => error.property === 'visitStatus'));
  });

  it('rejects backdated milestone input and requires override/correction reasons', async () => {
    const milestone = Object.assign(new MilestoneDto(), {
      milestoneType: 'REPORT_SHARED_TO_SPONSOR',
      occurredAt: '2026-01-01T00:00:00.000Z',
    });
    const milestoneErrors = await validate(milestone, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    assert.ok(milestoneErrors.some((error) => error.property === 'occurredAt'));
    const override = Object.assign(new TimelineOverrideDto(), {
      workingDays: 7,
      reason: '',
    });
    assert.ok(
      (await validate(override)).some((error) => error.property === 'reason'),
    );
    const correction = Object.assign(new MilestoneCorrectionDto(), {
      reason: '',
    });
    assert.ok(
      (await validate(correction)).some((error) => error.property === 'reason'),
    );
  });

  it('accepts only controlled milestone types and tracker sort fields', async () => {
    const firstDraft = Object.assign(new MilestoneDto(), {
      milestoneType: 'FIRST_DRAFT_SUBMITTED',
    });
    assert.equal((await validate(firstDraft)).length, 0);
    const invalidMilestone = Object.assign(new MilestoneDto(), {
      milestoneType: 'CLIENT_SUPPLIED_DATE',
    });
    assert.ok(
      (await validate(invalidMilestone)).some(
        (error) => error.property === 'milestoneType',
      ),
    );
    const trackerSort = Object.assign(new TrackerQueryDto(), {
      sort: 'sponsorDeadlineDate',
    });
    assert.equal((await validate(trackerSort)).length, 0);
    const invalidSort = Object.assign(new TrackerQueryDto(), {
      sort: 'sponsorName',
    });
    assert.ok(
      (await validate(invalidSort)).some((error) => error.property === 'sort'),
    );
  });

  it('redacts sponsor identity and sponsor project ID for a CRA response', async () => {
    const repository = new FakeProjectsRepository();
    const audit = new FakeAuditRepository();
    const service = projectsService(repository, audit);
    const result = await service.list(
      actor({
        id: '00000000-0000-4000-8000-000000000102',
        roles: ['CRA_MONITOR'],
        permissions: ['View', 'Edit'],
      }),
      {
        page: 1,
        pageSize: 25,
        sort: 'serialNo',
        direction: 'asc',
      },
    );
    assert.equal(result.items[0]!.clientCode, 'CLIENT-01');
    assert.equal('sponsorName' in result.items[0]!, false);
    assert.equal('sponsorProjectId' in result.items[0]!, false);
    await assert.rejects(
      service.list(
        actor({
          id: '00000000-0000-4000-8000-000000000102',
          roles: ['CRA_MONITOR'],
        }),
        {
          sponsor: 'Confidential Sponsor',
          page: 1,
          pageSize: 25,
          sort: 'serialNo',
          direction: 'asc',
        },
      ),
      { status: 403 },
    );
  });

  it('restricts a PM to assigned projects at object level', async () => {
    const repository = new FakeProjectsRepository();
    const service = projectsService(repository);
    await assert.rejects(
      service.detail(
        actor({ id: '00000000-0000-4000-8000-000000000199' }),
        project.id,
      ),
      { status: 404 },
    );
  });

  it('creates an assignment notification and audits project creation', async () => {
    const repository = new FakeProjectsRepository();
    const audit = new FakeAuditRepository();
    const service = projectsService(repository, audit);
    await service.create(
      actor({ roles: ['ASSOCIATE_DIRECTOR_GCP'], permissions: ['Create'] }),
      {
        inHouseProjectId: 'ZEN-001',
        sponsorProjectId: 'SP-1',
        sponsorName: 'Sponsor',
        clientCode: 'C-1',
        title: 'Trial',
        receiptDate: '2026-10-15',
        pmUserId: project.pmUserId,
      },
      'request-id',
    );
    assert.equal(repository.notificationCount, 1);
    assert.equal(audit.events[0]?.eventType, 'project_created');
  });

  it('maps database duplicate identifiers to a safe conflict', async () => {
    const repository = new FakeProjectsRepository();
    repository.create = async () => {
      throw Object.assign(new Error('duplicate detail is not exposed'), {
        code: '23505',
      });
    };
    const service = projectsService(repository);
    await assert.rejects(
      service.create(actor({ roles: ['ASSOCIATE_DIRECTOR_GCP'] }), {
        inHouseProjectId: 'ZEN-001',
        sponsorProjectId: 'SP-1',
        sponsorName: 'Sponsor',
        clientCode: 'C-1',
        title: 'Trial',
        receiptDate: '2026-10-15',
        pmUserId: project.pmUserId,
      }),
      { status: 409 },
    );
  });

  it('requires a reason for decline or return and audits acceptance', async () => {
    const repository = new FakeProjectsRepository();
    const audit = new FakeAuditRepository();
    const service = projectsService(repository, audit);
    await assert.rejects(service.respond(actor(), project.id, 'decline', ''));
    const result = await service.respond(
      actor(),
      project.id,
      'accept',
      undefined,
    );
    assert.equal(result.assignmentState, 'ACCEPTED');
    assert.equal(repository.accepted, true);
    assert.equal(audit.events[0]?.eventType, 'project_assignment_accepted');
  });

  it('creates actual CSV and XLSX file payloads without a new dependency', () => {
    const csv = csvExport(['Title'], [['Trial, phase 1']]);
    assert.match(csv.toString(), /"Trial, phase 1"/);
    const xlsx = xlsxExport(['Title'], [['Trial']]);
    assert.equal(xlsx.subarray(0, 2).toString(), 'PK');
    assert.ok(xlsx.length > 500);
  });

  it('supports multiple visits and calculates each deadline independently', async () => {
    const repository = new FakeProjectsRepository();
    const service = projectsService(repository);
    const first = await service.createVisit(actor(), project.id, {
      visitType: 'SIV',
      visitEndDate: '2026-10-16',
    });
    const second = await service.createVisit(actor(), project.id, {
      visitType: 'Periodic Visit',
      visitEndDate: '2026-10-19',
    });
    assert.equal(first.visitSequence, 1);
    assert.equal(first.sponsorDeadlineDate, '2026-10-23');
    assert.equal(second.visitSequence, 2);
    assert.equal(second.sponsorDeadlineDate, '2026-10-26');
  });

  it('applies a PM timeline override to one visit and audits old and new values', async () => {
    const repository = new FakeProjectsRepository();
    const audit = new FakeAuditRepository();
    const service = projectsService(repository, audit);
    const result = await service.overrideTimeline(
      actor(),
      '00000000-0000-4000-8000-000000000401',
      7,
      'Sponsor agreement allows seven working days.',
    );
    assert.deepEqual(repository.override, {
      workingDays: 7,
      deadline: '2026-10-27',
    });
    assert.equal(result.sponsorDeadlineDate, '2026-10-27');
    assert.equal(audit.events[0]?.eventType, 'project_timeline_overridden');
    assert.equal(audit.events[0]?.context?.beforeWorkingDays, 5);
    assert.equal(audit.events[0]?.context?.afterWorkingDays, 7);
  });

  it('records milestones with a server timestamp and preserves correction history', async () => {
    const repository = new FakeProjectsRepository();
    const audit = new FakeAuditRepository();
    const service = projectsService(repository, audit);
    const before = Date.now();
    const milestone = await service.milestone(
      actor(),
      '00000000-0000-4000-8000-000000000401',
      'REPORT_SHARED_TO_SPONSOR',
    );
    assert.ok(new Date(milestone.occurredAt).getTime() >= before);
    const correction = await service.correctMilestone(
      actor({ roles: ['QMS'], permissions: ['AuditReview'] }),
      milestone.id,
      'The action was recorded against the wrong visit.',
    );
    assert.equal(correction.corrected, true);
    assert.deepEqual(
      audit.events.map((event) => event.eventType),
      ['project_milestone_recorded', 'project_milestone_correction_recorded'],
    );
  });

  it('records the first-draft handoff as a server-stamped milestone without a new SLA', async () => {
    const repository = new FakeProjectsRepository();
    const audit = new FakeAuditRepository();
    const service = projectsService(repository, audit);
    const milestone = await service.milestone(
      actor(),
      '00000000-0000-4000-8000-000000000401',
      'FIRST_DRAFT_SUBMITTED',
    );
    assert.equal(repository.lastMilestoneType, 'FIRST_DRAFT_SUBMITTED');
    assert.ok(Number.isFinite(new Date(milestone.occurredAt).getTime()));
    assert.equal(audit.events[0]?.eventType, 'project_milestone_recorded');
  });

  it('runs idempotent overdue catch-up with the configured business date', async () => {
    const repository = new FakeProjectsRepository();
    const audit = new FakeAuditRepository();
    const service = projectsService(repository, audit);
    await service.dashboard(actor());
    assert.equal(audit.events.length, 0);
    repository.overdueRows.push({
      visitId: '00000000-0000-4000-8000-000000000401',
      projectId: project.id,
      pmUserId: project.pmUserId,
    });
    await service.dashboard(actor());
    assert.equal(audit.events.length, 0);
    assert.equal(repository.overdueBusinessDates.length, 2);
    assert.match(repository.overdueBusinessDates[0]!, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('processes overdue work automatically without a dashboard request', async () => {
    const repository = new FakeProjectsRepository();
    repository.overdueRows.push({
      visitId: '00000000-0000-4000-8000-000000000401',
      projectId: project.id,
      pmUserId: project.pmUserId,
    });
    const processor = new OverdueProcessor(
      repository as unknown as ProjectsRepository,
      businessTime,
      projectConfig,
    );
    assert.deepEqual(await processor.runOnce(), {
      status: 'completed',
      processed: 1,
    });
    assert.deepEqual(await processor.runOnce(), {
      status: 'completed',
      processed: 0,
    });
  });

  it('prevents overlapping processor runs in one application instance', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const repository = {
      async raiseOverdue() {
        calls += 1;
        await pending;
        return [];
      },
    };
    const processor = new OverdueProcessor(
      repository as unknown as ProjectsRepository,
      businessTime,
      projectConfig,
    );
    const first = processor.runOnce();
    assert.deepEqual(await processor.runOnce(), {
      status: 'busy',
      processed: 0,
    });
    release();
    assert.equal((await first).status, 'completed');
    assert.equal(calls, 1);
  });

  it('retries safely after a transient processing failure', async () => {
    let calls = 0;
    const repository = {
      async raiseOverdue() {
        calls += 1;
        if (calls === 1) throw new Error('test-only failure');
        return [];
      },
    };
    const processor = new OverdueProcessor(
      repository as unknown as ProjectsRepository,
      businessTime,
      projectConfig,
    );
    assert.equal((await processor.runOnce()).status, 'failed');
    assert.equal((await processor.runOnce()).status, 'completed');
    assert.equal(calls, 2);
  });

  it('derives role scope without trusting a client-supplied role', () => {
    assert.equal(projectAccess(actor())?.organizationWide, false);
    assert.equal(
      projectAccess(actor({ roles: ['QMS'] }))?.organizationWide,
      true,
    );
    assert.equal(
      projectAccess(actor({ roles: ['SYSTEM_ADMINISTRATOR'] })),
      null,
    );
  });

  it('transfers assignment-based access and preserves an audit record', async () => {
    const repository = new FakeProjectsRepository();
    const audit = new FakeAuditRepository();
    const service = projectsService(repository, audit);
    const newPmUserId = '00000000-0000-4000-8000-000000000109';
    await service.transfer(
      actor({
        roles: ['ASSOCIATE_DIRECTOR_GCP'],
        permissions: ['TransferOwnership'],
      }),
      project.id,
      newPmUserId,
      'Approved workload transfer.',
      'request-id',
    );
    await assert.rejects(service.detail(actor(), project.id), { status: 404 });
    assert.equal(
      (await service.detail(actor({ id: newPmUserId }), project.id)).id,
      project.id,
    );
    assert.equal(audit.events[0]?.eventType, 'project_ownership_transferred');
    assert.equal(audit.events[0]?.reason, 'Approved workload transfer.');
  });

  it('denies an unauthorized ownership transfer without changing assignment scope', async () => {
    const repository = new FakeProjectsRepository();
    const service = projectsService(repository);
    await assert.rejects(
      service.transfer(
        actor(),
        project.id,
        '00000000-0000-4000-8000-000000000109',
        'A project manager cannot authorize this transfer.',
      ),
      { status: 403 },
    );
    assert.equal(repository.projects[0]!.pmUserId, project.pmUserId);
  });

  it('defines additive project, visit, milestone, notification, and history tables', async () => {
    const source = await readFile(
      new URL(
        '../../../../packages/database/migrations/1810000000000-stage-3-project-tracking.cjs',
        import.meta.url,
      ),
      'utf8',
    );
    for (const table of [
      'projects',
      'project_assignments',
      'project_visits',
      'project_milestones',
      'project_timeline_overrides',
      'project_ownership_transfers',
      'notifications',
    ])
      assert.match(source, new RegExp(`CREATE TABLE zenovel\\.${table}`));
    assert.match(source, /UNIQUE\(project_id,visit_sequence\)/);
    assert.match(
      source,
      /sponsor_timeline_working_days integer NOT NULL DEFAULT 5/,
    );
    assert.match(source, /CREATE UNIQUE INDEX notifications_overdue_once_idx/);
    assert.match(source, /'FIRST_DRAFT_SUBMITTED'/);
    assert.doesNotMatch(source, /DROP TABLE zenovel\.users|TRUNCATE/i);
  });

  it('uses server-side tracker sorting and audits newly persisted notifications', async () => {
    const source = await readFile(
      new URL('../../src/projects/projects.repository.ts', import.meta.url),
      'utf8',
    );
    assert.match(source, /sponsorDeadlineDate: 'v\.sponsor_deadline_date'/);
    assert.match(
      source,
      /ORDER BY \$\{sort\} \$\{direction\} NULLS LAST,p\.serial_no ASC,v\.visit_sequence ASC/,
    );
    assert.match(source, /'notification_created'/);
    assert.match(source, /ON CONFLICT DO NOTHING RETURNING id/);
  });

  it('makes database overdue processing concurrent-safe and keeps deviations separate', async () => {
    const source = await readFile(
      new URL('../../src/projects/projects.repository.ts', import.meta.url),
      'utf8',
    );
    assert.match(source, /pg_try_advisory_xact_lock/);
    assert.match(source, /v\.visit_end_date IS NOT NULL/);
    assert.match(source, /\['QMS', 'ASSOCIATE_DIRECTOR_GCP'\]/);
    assert.match(source, /sponsor_report_overdue_raised/);
    assert.doesNotMatch(
      source.match(/async raiseOverdue[\s\S]*?async notifications/)?.[0] ?? '',
      /deviation_reported\s*=/,
    );
    assert.doesNotMatch(
      source.match(/async overrideTimeline[\s\S]*?async milestone/)?.[0] ?? '',
      /sponsor_report_overdue\s*=/,
    );
  });
});

describe('Stage 3 real HTTP authorization guards', () => {
  it('allows an Associate Director GCP to reach validated project creation', async () => {
    const csrf = 'stage-three-associate-director-csrf';
    const session: AuthSession = {
      id: '00000000-0000-4000-8000-000000000300',
      user: actor({
        roles: ['ASSOCIATE_DIRECTOR_GCP'],
        permissions: ['View', 'Create'],
      }),
      csrfTokenHash: tokenHash(csrf),
      absoluteExpiresAt: new Date(Date.now() + 3_600_000),
    };
    const sessions = {
      findSession: mock.fn(async () => session),
      touchSession: mock.fn(async () => undefined),
    };
    const auth = new AuthService(
      sessions as unknown as AuthRepository,
      authConfig,
    );
    const create = mock.fn(async () => ({
      id: project.id,
      serialNo: project.serialNo,
    }));
    const guardConfig = new ConfigService<Environment, true>({
      CORS_ORIGINS: ['http://localhost:3000'],
      SESSION_COOKIE_NAME: 'zenovel_session',
    } as Environment);
    const module = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        { provide: ProjectsService, useValue: { create } },
        { provide: AuthService, useValue: auth },
        { provide: ConfigService, useValue: guardConfig },
        AuthorizationService,
        { provide: APP_GUARD, useClass: AuthenticationGuard },
        { provide: APP_GUARD, useClass: PermissionGuard },
      ],
    }).compile();
    const app = module.createNestApplication<NestExpressApplication>({
      logger: false,
      bodyParser: false,
    });
    setup(app, new SafeLogger());
    try {
      await app.init();
      const response = await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Cookie', 'zenovel_session=isolated-ad-project-session')
        .set('Origin', 'http://localhost:3000')
        .set('X-CSRF-Token', csrf)
        .send({
          inHouseProjectId: 'ZEN-HTTP-001',
          sponsorProjectId: 'SP-HTTP-001',
          sponsorName: 'HTTP Test Sponsor',
          clientCode: 'HTTP-CLIENT',
          title: 'Validated HTTP project',
          receiptDate: '2026-10-16',
          pmUserId: project.pmUserId,
        })
        .expect(201);
      assert.equal(response.body.id, project.id);
      assert.equal(create.mock.callCount(), 1);
    } finally {
      await app.close();
    }
  });

  it('denies a CRA/Monitor direct access to the complete tracker', async () => {
    const cra = actor({
      roles: ['CRA_MONITOR'],
      permissions: ['View', 'Edit', 'Comment', 'Respond'],
    });
    const session: AuthSession = {
      id: '00000000-0000-4000-8000-000000000301',
      user: cra,
      csrfTokenHash: tokenHash('unused'),
      absoluteExpiresAt: new Date(Date.now() + 3_600_000),
    };
    const sessions = {
      findSession: mock.fn(async () => session),
      touchSession: mock.fn(async () => undefined),
    };
    const auth = new AuthService(
      sessions as unknown as AuthRepository,
      authConfig,
    );
    const tracker = mock.fn(async () => ({ items: [] }));
    const exportTracker = mock.fn(async () => Buffer.from('not-called'));
    const guardConfig = new ConfigService<Environment, true>({
      CORS_ORIGINS: ['http://localhost:3000'],
      SESSION_COOKIE_NAME: 'zenovel_session',
    } as Environment);
    const module = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        {
          provide: ProjectsService,
          useValue: { tracker, export: exportTracker },
        },
        { provide: AuthService, useValue: auth },
        { provide: ConfigService, useValue: guardConfig },
        AuthorizationService,
        { provide: APP_GUARD, useClass: AuthenticationGuard },
        { provide: APP_GUARD, useClass: PermissionGuard },
      ],
    }).compile();
    const app = module.createNestApplication<NestExpressApplication>({
      logger: false,
      bodyParser: false,
    });
    setup(app, new SafeLogger());
    try {
      await app.init();
      const response = await request(app.getHttpServer())
        .get('/api/v1/projects/tracker')
        .set('Cookie', 'zenovel_session=isolated-cra-project-session')
        .expect(403);
      assert.equal(response.body.code, 'ACCESS_DENIED');
      assert.equal(response.body.message, 'Access is denied.');
      assert.equal(tracker.mock.callCount(), 0);
      const exportResponse = await request(app.getHttpServer())
        .get('/api/v1/projects/tracker/export?format=csv')
        .set('Cookie', 'zenovel_session=isolated-cra-project-session')
        .expect(403);
      assert.equal(exportResponse.body.code, 'ACCESS_DENIED');
      assert.equal(exportTracker.mock.callCount(), 0);
    } finally {
      await app.close();
    }
  });

  it('rejects project creation by a PM before controller logic runs', async () => {
    const csrf = 'stage-three-csrf';
    const session: AuthSession = {
      id: '00000000-0000-4000-8000-000000000302',
      user: actor(),
      csrfTokenHash: tokenHash(csrf),
      absoluteExpiresAt: new Date(Date.now() + 3_600_000),
    };
    const sessions = {
      findSession: mock.fn(async () => session),
      touchSession: mock.fn(async () => undefined),
    };
    const auth = new AuthService(
      sessions as unknown as AuthRepository,
      authConfig,
    );
    const create = mock.fn(async () => ({ id: project.id }));
    const guardConfig = new ConfigService<Environment, true>({
      CORS_ORIGINS: ['http://localhost:3000'],
      SESSION_COOKIE_NAME: 'zenovel_session',
    } as Environment);
    const module = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        { provide: ProjectsService, useValue: { create } },
        { provide: AuthService, useValue: auth },
        { provide: ConfigService, useValue: guardConfig },
        AuthorizationService,
        { provide: APP_GUARD, useClass: AuthenticationGuard },
        { provide: APP_GUARD, useClass: PermissionGuard },
      ],
    }).compile();
    const app = module.createNestApplication<NestExpressApplication>({
      logger: false,
      bodyParser: false,
    });
    setup(app, new SafeLogger());
    try {
      await app.init();
      await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Cookie', 'zenovel_session=isolated-pm-project-session')
        .set('Origin', 'http://localhost:3000')
        .set('X-CSRF-Token', csrf)
        .send({})
        .expect(403);
      assert.equal(create.mock.callCount(), 0);
    } finally {
      await app.close();
    }
  });
});
