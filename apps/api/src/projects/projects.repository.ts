import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service.js';
import type {
  CreateProjectDto,
  CreateClientDto,
  CreateVisitDto,
  CreateVisitTypeDto,
  ProjectQueryDto,
  TrackerQueryDto,
} from './projects.dto.js';
import type {
  ProjectAccess,
  MilestoneType,
  ProjectRow,
  ProjectStatus,
  TrackerRow,
  ClientRow,
  VisitTypeRow,
} from './projects.types.js';

type ProjectCreated = { id: string; serialNo: string };
type AssignmentResult = {
  projectId: string;
  previousState: string;
  nextState: string;
};
type VisitDeadline = {
  id: string;
  projectId: string;
  visitStartDate: string | null;
  visitEndDate: string | null;
  sponsorTimelineWorkingDays: number;
  sponsorDeadlineDate: string | null;
  monitorUserId: string | null;
  visitStatus?: string;
};

export type MonitorConflict = {
  visitId: string;
  visitStartDate: string;
  visitEndDate: string;
};

function scheduleConflictError(
  conflict: MonitorConflict,
): Error & { code: string; conflict: MonitorConflict } {
  return Object.assign(new Error('Monitor scheduling conflict.'), {
    code: 'MONITOR_SCHEDULE_CONFLICT',
    conflict,
  });
}

const projectColumns = `p.id,p.serial_no::text AS "serialNo",p.in_house_project_id AS "inHouseProjectId",
  p.sponsor_project_id AS "sponsorProjectId",COALESCE(c.name,p.sponsor_name) AS "sponsorName",COALESCE(c.code,p.client_code) AS "clientCode",p.client_id AS "clientId",
  p.title,p.project_detail AS "projectDetail",p.regulatory_submission_details AS "regulatorySubmissionDetails",
  p.cro_name AS "croName",p.clinical_site AS "clinicalSite",
  p.bioanalytical_facility AS "bioanalyticalFacility",p.receipt_date::text AS "receiptDate",
  p.tentative_start_date::text AS "tentativeStartDate",p.category,p.status,p.assignment_state AS "assignmentState",
  p.pm_user_id AS "pmUserId",pm.full_name AS "pmName",p.provisional_monitor_id AS "provisionalMonitorId",
  mon.full_name AS "provisionalMonitorName",p.created_at AS "createdAt"`;

const accessSql = `($1::boolean OR p.pm_user_id=$2::uuid OR p.provisional_monitor_id=$2::uuid OR EXISTS
  (SELECT 1 FROM zenovel.project_visits access_visit WHERE access_visit.project_id=p.id AND access_visit.monitor_user_id=$2::uuid))`;

function filters(query: ProjectQueryDto, start = 3) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    clauses.push(sql.replaceAll('?', `$${start + values.length}`));
    values.push(value);
  };
  if (query.sponsor)
    add(
      `(COALESCE(c.name,p.sponsor_name) ILIKE '%'||?||'%' OR COALESCE(c.code,p.client_code) ILIKE '%'||?||'%')`,
      query.sponsor,
    );
  if (query.projectId)
    add(`p.sponsor_project_id ILIKE '%'||?||'%'`, query.projectId);
  if (query.inHouseProjectId)
    add(`p.in_house_project_id ILIKE '%'||?||'%'`, query.inHouseProjectId);
  if (query.title) add(`p.title ILIKE '%'||?||'%'`, query.title);
  if (query.location)
    add(
      `(p.cro_name ILIKE '%'||?||'%' OR p.clinical_site ILIKE '%'||?||'%' OR p.bioanalytical_facility ILIKE '%'||?||'%')`,
      query.location,
    );
  if (query.projectManagerId)
    add('p.pm_user_id=?::uuid', query.projectManagerId);
  if (query.status) add('p.status=?', query.status);
  if (query.from) add('p.receipt_date>=?::date', query.from);
  if (query.to) add('p.receipt_date<=?::date', query.to);
  return { clauses, values };
}

@Injectable()
export class ProjectsRepository {
  constructor(private readonly db: DatabaseService) {}

  async options() {
    const result = await this.db.query<{
      id: string;
      fullName: string;
      username: string;
      role: string;
    }>(
      `SELECT DISTINCT u.id,u.full_name AS "fullName",u.username,r.code AS role
      FROM zenovel.users u JOIN zenovel.user_roles ur ON ur.user_id=u.id JOIN zenovel.roles r ON r.id=ur.role_id
      WHERE u.status='active' AND r.active=true AND r.code=ANY($1::text[]) ORDER BY u.full_name,r.code`,
      [['PROJECT_MANAGER', 'CRA_MONITOR']],
    );
    return result.rows;
  }

  async visitTypes(includeInactive = false): Promise<VisitTypeRow[]> {
    const result = await this.db.query<VisitTypeRow>(
      `SELECT t.id,t.display_name AS "displayName",t.active,
       EXISTS(SELECT 1 FROM zenovel.project_visits v WHERE v.visit_type_id=t.id) AS "inUse"
       FROM zenovel.visit_types t WHERE ($1::boolean OR t.active=true)
       ORDER BY t.active DESC,t.display_name`,
      [includeInactive],
    );
    return result.rows;
  }

  async activeVisitType(id: string) {
    const result = await this.db.query<{ id: string; displayName: string }>(
      `SELECT id,display_name AS "displayName" FROM zenovel.visit_types WHERE id=$1 AND active=true`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async createVisitType(input: CreateVisitTypeDto, actorId: string) {
    const result = await this.db.query<VisitTypeRow>(
      `INSERT INTO zenovel.visit_types(id,display_name,normalized_name,created_by,updated_by)
       VALUES($1,$2::varchar,lower(trim($2::text)),$3,$3)
       RETURNING id,display_name AS "displayName",active,false AS "inUse"`,
      [randomUUID(), input.displayName, actorId],
    );
    return result.rows[0]!;
  }

  async updateVisitType(
    id: string,
    input: { displayName?: string; active?: boolean },
    actorId: string,
  ) {
    const result = await this.db.query<VisitTypeRow>(
      `UPDATE zenovel.visit_types SET
       display_name=COALESCE($2::varchar,display_name),
       normalized_name=CASE WHEN $2::text IS NULL THEN normalized_name ELSE lower(trim($2::text)) END,
       active=COALESCE($3,active),updated_by=$4,updated_at=now()
       WHERE id=$1
       RETURNING id,display_name AS "displayName",active,
       EXISTS(SELECT 1 FROM zenovel.project_visits v WHERE v.visit_type_id=visit_types.id) AS "inUse"`,
      [id, input.displayName ?? null, input.active ?? null, actorId],
    );
    return result.rows[0] ?? null;
  }

  async clients(includeInactive = false): Promise<ClientRow[]> {
    const result = await this.db.query<ClientRow>(
      `SELECT c.id,c.name,c.code,c.active,
       EXISTS(SELECT 1 FROM zenovel.projects p WHERE p.client_id=c.id) AS "inUse"
       FROM zenovel.clients c WHERE ($1::boolean OR c.active=true)
       ORDER BY c.active DESC,c.name,c.code`,
      [includeInactive],
    );
    return result.rows;
  }

  async activeClient(id: string) {
    const result = await this.db.query<{
      id: string;
      name: string;
      code: string;
    }>('SELECT id,name,code FROM zenovel.clients WHERE id=$1 AND active=true', [
      id,
    ]);
    return result.rows[0] ?? null;
  }

  async createClient(input: CreateClientDto, actorId: string) {
    const result = await this.db.query<ClientRow>(
      `INSERT INTO zenovel.clients(id,name,code,normalized_name,normalized_code,created_by,updated_by)
       VALUES($1,$2::varchar,$3::varchar,lower(trim($2::text)),lower(trim($3::text)),$4,$4)
       RETURNING id,name,code,active,false AS "inUse"`,
      [randomUUID(), input.name, input.code, actorId],
    );
    return result.rows[0]!;
  }

  async updateClient(
    id: string,
    input: { name?: string; code?: string; active?: boolean },
    actorId: string,
  ) {
    const result = await this.db.query<ClientRow>(
      `UPDATE zenovel.clients SET name=COALESCE($2::varchar,name),code=COALESCE($3::varchar,code),
       normalized_name=CASE WHEN $2::text IS NULL THEN normalized_name ELSE lower(trim($2::text)) END,
       normalized_code=CASE WHEN $3::text IS NULL THEN normalized_code ELSE lower(trim($3::text)) END,
       active=COALESCE($4,active),updated_by=$5,updated_at=now()
       WHERE id=$1 RETURNING id,name,code,active,
       EXISTS(SELECT 1 FROM zenovel.projects p WHERE p.client_id=clients.id) AS "inUse"`,
      [
        id,
        input.name ?? null,
        input.code ?? null,
        input.active ?? null,
        actorId,
      ],
    );
    return result.rows[0] ?? null;
  }

  async isEligible(userId: string, role: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT 1 FROM zenovel.users u JOIN zenovel.user_roles ur ON ur.user_id=u.id
       JOIN zenovel.roles r ON r.id=ur.role_id
       WHERE u.id=$1 AND u.status='active' AND r.active=true AND r.code=$2 LIMIT 1`,
      [userId, role],
    );
    return result.rowCount === 1;
  }

  async create(
    input: CreateProjectDto,
    actorId: string,
  ): Promise<ProjectCreated | null> {
    return this.db.transaction(async (client) => {
      const selectedClient = await client.query<{ name: string; code: string }>(
        'SELECT name,code FROM zenovel.clients WHERE id=$1 AND active=true',
        [input.clientId],
      );
      if (!selectedClient.rows[0]) return null;
      const id = randomUUID();
      const project = await client.query<ProjectCreated>(
        `INSERT INTO zenovel.projects
        (id,in_house_project_id,sponsor_project_id,sponsor_name,client_code,client_id,title,project_detail,regulatory_submission_details,cro_name,
         clinical_site,bioanalytical_facility,receipt_date,tentative_start_date,category,pm_user_id,provisional_monitor_id,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        RETURNING id,serial_no::text AS "serialNo"`,
        [
          id,
          input.inHouseProjectId,
          input.sponsorProjectId,
          selectedClient.rows[0].name,
          selectedClient.rows[0].code,
          input.clientId,
          input.title,
          input.projectDetail ?? null,
          input.regulatorySubmissionDetails ?? null,
          input.croName ?? null,
          input.clinicalSite ?? null,
          input.bioanalyticalFacility ?? null,
          input.receiptDate,
          input.tentativeStartDate ?? null,
          input.category ?? null,
          input.pmUserId,
          input.provisionalMonitorId ?? null,
          actorId,
        ],
      );
      await client.query(
        `INSERT INTO zenovel.project_assignments(id,project_id,pm_user_id,state,assigned_by)
         VALUES($1,$2,$3,'PENDING',$4)`,
        [randomUUID(), id, input.pmUserId, actorId],
      );
      await this.notify(
        client,
        input.pmUserId,
        'PROJECT_ASSIGNED',
        id,
        null,
        'A project assignment is awaiting your response.',
        `/projects/${id}`,
      );
      return project.rows[0]!;
    });
  }

  async list(access: ProjectAccess, query: ProjectQueryDto) {
    const selected = filters(query);
    const sort =
      {
        serialNo: 'p.serial_no',
        title: 'p.title',
        receiptDate: 'p.receipt_date',
        status: 'p.status',
      }[query.sort] ?? 'p.serial_no';
    const offset = (query.page - 1) * query.pageSize;
    const values = [
      access.organizationWide,
      access.userId,
      ...selected.values,
      query.pageSize,
      offset,
    ];
    const limitIndex = values.length - 1;
    const where = [accessSql, ...selected.clauses].join(' AND ');
    const result = await this.db.query<ProjectRow & { totalCount: string }>(
      `SELECT ${projectColumns},count(v.id)::integer AS "visitCount",count(*) OVER()::text AS "totalCount"
       FROM zenovel.projects p LEFT JOIN zenovel.users pm ON pm.id=p.pm_user_id
       LEFT JOIN zenovel.users mon ON mon.id=p.provisional_monitor_id LEFT JOIN zenovel.clients c ON c.id=p.client_id
       LEFT JOIN zenovel.project_visits v ON v.project_id=p.id
       WHERE ${where} GROUP BY p.id,pm.full_name,mon.full_name,c.name,c.code
       ORDER BY ${sort} ${query.direction === 'desc' ? 'DESC' : 'ASC'},p.serial_no ASC
       LIMIT $${limitIndex} OFFSET $${limitIndex + 1}`,
      values,
    );
    return {
      items: result.rows,
      total: Number(result.rows[0]?.totalCount ?? 0),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async find(
    access: ProjectAccess,
    projectId: string,
  ): Promise<ProjectRow | null> {
    const result = await this.db.query<ProjectRow>(
      `SELECT ${projectColumns},count(v.id)::integer AS "visitCount"
       FROM zenovel.projects p LEFT JOIN zenovel.users pm ON pm.id=p.pm_user_id
       LEFT JOIN zenovel.users mon ON mon.id=p.provisional_monitor_id LEFT JOIN zenovel.clients c ON c.id=p.client_id
       LEFT JOIN zenovel.project_visits v ON v.project_id=p.id
       WHERE ${accessSql} AND p.id=$3::uuid GROUP BY p.id,pm.full_name,mon.full_name,c.name,c.code`,
      [access.organizationWide, access.userId, projectId],
    );
    return result.rows[0] ?? null;
  }

  async respond(
    projectId: string,
    pmUserId: string,
    decision: 'accept' | 'decline' | 'return',
    reason?: string,
  ): Promise<AssignmentResult | null> {
    return this.db.transaction(async (client) => {
      const current = await client.query<{ state: string }>(
        `SELECT a.state FROM zenovel.project_assignments a JOIN zenovel.projects p ON p.id=a.project_id
         WHERE a.project_id=$1 AND a.pm_user_id=$2 AND a.ended_at IS NULL AND p.pm_user_id=$2 FOR UPDATE OF a,p`,
        [projectId, pmUserId],
      );
      if (!current.rows[0]) return null;
      const previousState = current.rows[0].state;
      if (decision === 'accept' && previousState !== 'PENDING') return null;
      if (
        decision !== 'accept' &&
        !['PENDING', 'ACCEPTED'].includes(previousState)
      )
        return null;
      const nextState = decision.toUpperCase();
      await client.query(
        `UPDATE zenovel.project_assignments SET state=$3,response_reason=$4,responded_at=now(),
         ended_at=CASE WHEN $3='ACCEPTED' THEN NULL ELSE now() END WHERE project_id=$1 AND pm_user_id=$2 AND ended_at IS NULL`,
        [projectId, pmUserId, nextState, reason ?? null],
      );
      await client.query(
        `UPDATE zenovel.projects SET assignment_state=$2,
         pm_user_id=CASE WHEN $2='ACCEPTED' THEN pm_user_id ELSE NULL END,updated_at=now() WHERE id=$1`,
        [projectId, nextState],
      );
      if (decision !== 'accept')
        await this.notifyRoles(
          client,
          ['ASSOCIATE_DIRECTOR_GCP'],
          'PROJECT_ASSIGNMENT_RETURNED',
          projectId,
          null,
          'A project assignment requires reassignment.',
          `/projects/${projectId}`,
          'HIGH',
        );
      return { projectId, previousState, nextState };
    });
  }

  async setStatus(
    projectId: string,
    status: ProjectStatus,
    actorId: string,
    reason: string,
  ): Promise<{ previousStatus: string } | null> {
    return this.db.transaction(async (client) => {
      const current = await client.query<{ status: string }>(
        'SELECT status FROM zenovel.projects WHERE id=$1 FOR UPDATE',
        [projectId],
      );
      if (!current.rows[0]) return null;
      await client.query(
        'UPDATE zenovel.projects SET status=$2,updated_at=now() WHERE id=$1',
        [projectId, status],
      );
      await client.query(
        `INSERT INTO zenovel.project_status_history(id,project_id,previous_status,new_status,actor_user_id,reason)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [
          randomUUID(),
          projectId,
          current.rows[0].status,
          status,
          actorId,
          reason,
        ],
      );
      return { previousStatus: current.rows[0].status };
    });
  }

  async transfer(
    projectId: string,
    newPmUserId: string,
    actorId: string,
    reason: string,
  ) {
    return this.db.transaction(async (client) => {
      const project = await client.query<{ pmUserId: string | null }>(
        'SELECT pm_user_id AS "pmUserId" FROM zenovel.projects WHERE id=$1 FOR UPDATE',
        [projectId],
      );
      const previousPmUserId = project.rows[0]?.pmUserId;
      if (!previousPmUserId || previousPmUserId === newPmUserId) return null;
      await client.query(
        `UPDATE zenovel.project_assignments SET state='TRANSFERRED',ended_at=now(),response_reason=$2
         WHERE project_id=$1 AND ended_at IS NULL`,
        [projectId, reason],
      );
      await client.query(
        `INSERT INTO zenovel.project_assignments(id,project_id,pm_user_id,state,assigned_by)
         VALUES($1,$2,$3,'PENDING',$4)`,
        [randomUUID(), projectId, newPmUserId, actorId],
      );
      await client.query(
        `UPDATE zenovel.projects SET pm_user_id=$2,assignment_state='PENDING',updated_at=now() WHERE id=$1`,
        [projectId, newPmUserId],
      );
      await client.query(
        `INSERT INTO zenovel.project_ownership_transfers
         (id,project_id,previous_pm_user_id,new_pm_user_id,actor_user_id,reason) VALUES($1,$2,$3,$4,$5,$6)`,
        [
          randomUUID(),
          projectId,
          previousPmUserId,
          newPmUserId,
          actorId,
          reason,
        ],
      );
      await client.query(
        `UPDATE zenovel.notifications SET read_at=COALESCE(read_at,now())
         WHERE project_id=$1 AND recipient_user_id=$2 AND read_at IS NULL`,
        [projectId, previousPmUserId],
      );
      await this.notify(
        client,
        newPmUserId,
        'PROJECT_OWNERSHIP_TRANSFERRED',
        projectId,
        null,
        'Project ownership has been transferred to you and awaits acceptance.',
        `/projects/${projectId}`,
        'HIGH',
      );
      return { previousPmUserId, newPmUserId };
    });
  }

  async calendar(startDate: string): Promise<Map<string, boolean>> {
    const result = await this.db.query<{ date: string; working: boolean }>(
      `SELECT calendar_date::text AS date,is_working_day AS working FROM zenovel.working_calendar_days
       WHERE calendar_date BETWEEN $1::date AND $1::date+90`,
      [startDate],
    );
    return new Map(result.rows.map((row) => [row.date, row.working]));
  }

  async createVisit(
    projectId: string,
    input: CreateVisitDto,
    actorId: string,
    deadline: string | null,
    visitTypeName: string,
  ) {
    return this.db.transaction(async (client) => {
      const locked = await client.query(
        'SELECT id FROM zenovel.projects WHERE id=$1 FOR UPDATE',
        [projectId],
      );
      if (!locked.rows[0]) return null;
      if (
        input.monitorUserId &&
        (input.visitStatus ?? 'PLANNED') !== 'CANCELLED' &&
        input.visitStartDate &&
        input.visitEndDate
      ) {
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))',
          [input.monitorUserId],
        );
        const conflict = await this.monitorConflict(
          client,
          input.monitorUserId,
          input.visitStartDate,
          input.visitEndDate,
        );
        if (conflict) throw scheduleConflictError(conflict);
      }
      const id = randomUUID();
      const result = await client.query<{ id: string; visitSequence: number }>(
        `INSERT INTO zenovel.project_visits
         (id,project_id,visit_sequence,visit_type,visit_type_id,visit_status,report_status,capa_status,monitor_user_id,agenda_shared,
          visit_start_date,visit_end_date,visit_end_recorded_at,report_from_monitor,sponsor_approval,mfr_to_cro,capa_from_cro,capa_received_date,study_result,
          source_documents_status,qms_archival_submission,comments,final_archival_date,sponsor_deadline_date,created_by)
         SELECT $1,$2,COALESCE(max(visit_sequence),0)+1,$3,$4,$5,$6,$7,$8,$9,$10,$11,
          CASE WHEN $11::date IS NULL THEN NULL ELSE now() END,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
         FROM zenovel.project_visits WHERE project_id=$2
         RETURNING id,visit_sequence AS "visitSequence"`,
        [
          id,
          projectId,
          visitTypeName,
          input.visitTypeId,
          input.visitStatus ?? 'PLANNED',
          input.reportStatus ?? 'NOT_STARTED',
          input.capaStatus ?? 'NOT_APPLICABLE',
          input.monitorUserId ?? null,
          input.agendaShared ?? false,
          input.visitStartDate ?? null,
          input.visitEndDate ?? null,
          input.reportFromMonitor ?? null,
          input.sponsorApproval ?? null,
          input.mfrToCro ?? null,
          input.capaFromCro ?? null,
          input.capaReceivedDate ?? null,
          input.studyResult ?? null,
          input.sourceDocumentsStatus ?? null,
          input.qmsArchivalSubmission ?? null,
          input.comments ?? null,
          input.finalArchivalDate ?? null,
          deadline,
          actorId,
        ],
      );
      if (input.monitorUserId) {
        const identity = await client.query<{ inHouseProjectId: string }>(
          'SELECT in_house_project_id AS "inHouseProjectId" FROM zenovel.projects WHERE id=$1',
          [projectId],
        );
        await this.notify(
          client,
          input.monitorUserId,
          'MONITOR_VISIT_ASSIGNED',
          projectId,
          id,
          `You were assigned visit ${result.rows[0]!.visitSequence} for ${identity.rows[0]?.inHouseProjectId ?? 'a project'} (${input.visitStartDate ?? 'date pending'} to ${input.visitEndDate ?? 'date pending'}).`,
          `/projects/${projectId}`,
        );
      }
      return result.rows[0]!;
    });
  }

  async tracker(
    access: ProjectAccess,
    query: TrackerQueryDto,
    paginate = true,
  ) {
    const selected = filters(query);
    const addVisit = (sql: string, value: unknown) => {
      selected.clauses.push(sql.replace('?', `$${3 + selected.values.length}`));
      selected.values.push(value);
    };
    if (query.visitType)
      addVisit(`v.visit_type ILIKE '%'||?||'%'`, query.visitType);
    if (query.monitorId) addVisit('v.monitor_user_id=?::uuid', query.monitorId);
    if (query.visitStatus) addVisit('v.visit_status=?', query.visitStatus);
    if (query.reportStatus) addVisit('v.report_status=?', query.reportStatus);
    if (query.capaStatus) addVisit('v.capa_status=?', query.capaStatus);
    const values: unknown[] = [
      access.organizationWide,
      access.userId,
      ...selected.values,
    ];
    let paging = '';
    if (paginate) {
      values.push(query.pageSize, (query.page - 1) * query.pageSize);
      paging = `LIMIT $${values.length - 1} OFFSET $${values.length}`;
    }
    const sort =
      {
        serialNo: 'p.serial_no',
        title: 'p.title',
        receiptDate: 'p.receipt_date',
        status: 'p.status',
        visitSequence: 'v.visit_sequence',
        visitEndDate: 'v.visit_end_date',
        sponsorDeadlineDate: 'v.sponsor_deadline_date',
      }[query.sort] ?? 'p.serial_no';
    const direction = query.direction === 'desc' ? 'DESC' : 'ASC';
    const result = await this.db.query<TrackerRow & { totalCount: string }>(
      `SELECT ${projectColumns},count(*) OVER()::text AS "totalCount",1::integer AS "visitCount",
       v.id AS "visitId",v.visit_sequence AS "visitSequence",v.visit_type AS "visitType",v.visit_status AS "visitStatus",
       v.visit_type_id AS "visitTypeId",
       v.report_status AS "reportStatus",v.capa_status AS "capaStatus",v.monitor_user_id AS "monitorUserId",vm.full_name AS "monitorName",v.agenda_shared AS "agendaShared",
       v.report_from_monitor AS "reportFromMonitor",v.visit_start_date::text AS "visitStartDate",
       v.visit_end_date::text AS "visitEndDate",v.visit_end_recorded_at AS "visitEndRecordedAt",
       v.first_draft_submitted_at AS "firstDraftSubmittedAt",v.report_shared_to_sponsor_at AS "reportSharedToSponsorAt",
       v.signed_report_shared_at AS "signedReportSharedAt",v.sponsor_approval AS "sponsorApproval",v.mfr_to_cro AS "mfrToCro",
       v.capa_from_cro AS "capaFromCro",v.capa_received_date::text AS "capaReceivedDate",v.study_result AS "studyResult",
       v.source_documents_status AS "sourceDocumentsStatus",v.qms_archival_submission AS "qmsArchivalSubmission",
       v.comments,v.final_archival_date::text AS "finalArchivalDate",v.sponsor_timeline_working_days AS "sponsorTimelineWorkingDays",
       v.sponsor_deadline_date::text AS "sponsorDeadlineDate",v.sponsor_report_overdue AS "sponsorReportOverdue",
       v.deviation_required AS "deviationRequired",v.deviation_reported AS "deviationReported"
       FROM zenovel.projects p JOIN zenovel.project_visits v ON v.project_id=p.id
       LEFT JOIN zenovel.clients c ON c.id=p.client_id
       LEFT JOIN zenovel.users pm ON pm.id=p.pm_user_id LEFT JOIN zenovel.users mon ON mon.id=p.provisional_monitor_id
       LEFT JOIN zenovel.users vm ON vm.id=v.monitor_user_id
       WHERE ${[accessSql, ...selected.clauses].join(' AND ')}
        ORDER BY ${sort} ${direction} NULLS LAST,p.serial_no ASC,v.visit_sequence ASC ${paging}`,
      values,
    );
    return {
      items: result.rows,
      total: Number(result.rows[0]?.totalCount ?? 0),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async visitForUpdate(visitId: string): Promise<VisitDeadline | null> {
    const result = await this.db.query<VisitDeadline>(
      `SELECT id,project_id AS "projectId",visit_start_date::text AS "visitStartDate",visit_end_date::text AS "visitEndDate",
       sponsor_timeline_working_days AS "sponsorTimelineWorkingDays",sponsor_deadline_date::text AS "sponsorDeadlineDate",
       monitor_user_id AS "monitorUserId",visit_status AS "visitStatus"
       FROM zenovel.project_visits WHERE id=$1`,
      [visitId],
    );
    return result.rows[0] ?? null;
  }

  async updateVisitDates(
    visitId: string,
    startDate: string | null,
    endDate: string | null,
    deadline: string | null,
    actorId: string,
    reason: string,
  ) {
    return this.db.transaction(async (client) => {
      const current = await client.query<VisitDeadline>(
        `SELECT id,project_id AS "projectId",visit_start_date::text AS "visitStartDate",
         visit_end_date::text AS "visitEndDate",sponsor_timeline_working_days AS "sponsorTimelineWorkingDays",
         sponsor_deadline_date::text AS "sponsorDeadlineDate",monitor_user_id AS "monitorUserId",visit_status AS "visitStatus"
         FROM zenovel.project_visits WHERE id=$1 FOR UPDATE`,
        [visitId],
      );
      const previous = current.rows[0];
      if (!previous) return null;
      if (
        previous.monitorUserId &&
        previous.visitStatus !== 'CANCELLED' &&
        startDate &&
        endDate
      ) {
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))',
          [previous.monitorUserId],
        );
        const conflict = await this.monitorConflict(
          client,
          previous.monitorUserId,
          startDate,
          endDate,
          visitId,
        );
        if (conflict) throw scheduleConflictError(conflict);
      }
      await client.query(
        `UPDATE zenovel.project_visits SET visit_start_date=$2,visit_end_date=$3,
         visit_end_recorded_at=CASE WHEN $3::date IS NULL THEN NULL ELSE COALESCE(visit_end_recorded_at,now()) END,
         sponsor_deadline_date=$4,updated_at=now() WHERE id=$1`,
        [visitId, startDate, endDate, deadline],
      );
      await client.query(
        `INSERT INTO zenovel.project_visit_date_history
         (id,visit_id,previous_start_date,new_start_date,previous_end_date,new_end_date,
          previous_deadline_date,new_deadline_date,actor_user_id,reason)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          randomUUID(),
          visitId,
          previous.visitStartDate,
          startDate,
          previous.visitEndDate,
          endDate,
          previous.sponsorDeadlineDate,
          deadline,
          actorId,
          reason,
        ],
      );
      return previous;
    });
  }

  async availability(
    monitorUserId: string,
    startDate: string,
    endDate: string,
    excludeVisitId?: string,
  ): Promise<MonitorConflict | null> {
    return this.monitorConflict(
      this.db,
      monitorUserId,
      startDate,
      endDate,
      excludeVisitId,
    );
  }

  private async monitorConflict(
    queryable: {
      query<T extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: unknown[],
      ): Promise<QueryResult<T>>;
    },
    monitorUserId: string,
    startDate: string,
    endDate: string,
    excludeVisitId?: string,
  ): Promise<MonitorConflict | null> {
    const result = await queryable.query<MonitorConflict>(
      `SELECT id AS "visitId",visit_start_date::text AS "visitStartDate",
       visit_end_date::text AS "visitEndDate" FROM zenovel.project_visits
       WHERE monitor_user_id=$1 AND visit_status<>'CANCELLED'
       AND visit_start_date IS NOT NULL AND visit_end_date IS NOT NULL
       AND visit_start_date<=$3::date AND visit_end_date>=$2::date
       AND ($4::uuid IS NULL OR id<>$4::uuid)
       ORDER BY visit_start_date LIMIT 1`,
      [monitorUserId, startDate, endDate, excludeVisitId ?? null],
    );
    return result.rows[0] ?? null;
  }

  async updateVisitMonitor(
    visitId: string,
    monitorUserId: string | null,
    actorId: string,
    reason: string,
  ) {
    return this.db.transaction(async (client) => {
      const current = await client.query<{
        projectId: string;
        previousMonitorId: string | null;
        visitSequence: number;
        visitStartDate: string | null;
        visitEndDate: string | null;
        visitStatus: string;
        inHouseProjectId: string;
      }>(
        `SELECT v.project_id AS "projectId",v.monitor_user_id AS "previousMonitorId",
         v.visit_sequence AS "visitSequence",v.visit_start_date::text AS "visitStartDate",
         v.visit_end_date::text AS "visitEndDate",v.visit_status AS "visitStatus",
         p.in_house_project_id AS "inHouseProjectId"
         FROM zenovel.project_visits v JOIN zenovel.projects p ON p.id=v.project_id
         WHERE v.id=$1 FOR UPDATE OF v`,
        [visitId],
      );
      const row = current.rows[0];
      if (!row) return null;
      if (row.previousMonitorId === monitorUserId)
        return { ...row, unchanged: true };
      const locks = [
        ...new Set(
          [row.previousMonitorId, monitorUserId].filter(Boolean) as string[],
        ),
      ].sort();
      for (const id of locks)
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))',
          [id],
        );
      if (
        monitorUserId &&
        row.visitStatus !== 'CANCELLED' &&
        row.visitStartDate &&
        row.visitEndDate
      ) {
        const conflict = await this.monitorConflict(
          client,
          monitorUserId,
          row.visitStartDate,
          row.visitEndDate,
          visitId,
        );
        if (conflict) throw scheduleConflictError(conflict);
      }
      await client.query(
        'UPDATE zenovel.project_visits SET monitor_user_id=$2,updated_at=now() WHERE id=$1',
        [visitId, monitorUserId],
      );
      const range = `${row.visitStartDate ?? 'date pending'} to ${row.visitEndDate ?? 'date pending'}`;
      if (row.previousMonitorId)
        await this.notify(
          client,
          row.previousMonitorId,
          'MONITOR_VISIT_REMOVED',
          row.projectId,
          visitId,
          `You were removed from visit ${row.visitSequence} for ${row.inHouseProjectId} (${range}).`,
          `/projects/${row.projectId}`,
        );
      if (monitorUserId)
        await this.notify(
          client,
          monitorUserId,
          row.previousMonitorId
            ? 'MONITOR_VISIT_REASSIGNED'
            : 'MONITOR_VISIT_ASSIGNED',
          row.projectId,
          visitId,
          `You were assigned visit ${row.visitSequence} for ${row.inHouseProjectId} (${range}).`,
          `/projects/${row.projectId}`,
        );
      void actorId;
      void reason;
      return { ...row, newMonitorId: monitorUserId, unchanged: false };
    });
  }

  async overrideTimeline(
    visitId: string,
    workingDays: number,
    deadline: string | null,
    actorId: string,
    reason: string,
  ) {
    return this.db.transaction(async (client) => {
      const current = await client.query<VisitDeadline>(
        `SELECT id,project_id AS "projectId",visit_end_date::text AS "visitEndDate",
         sponsor_timeline_working_days AS "sponsorTimelineWorkingDays",sponsor_deadline_date::text AS "sponsorDeadlineDate"
         FROM zenovel.project_visits WHERE id=$1 FOR UPDATE`,
        [visitId],
      );
      const row = current.rows[0];
      if (!row) return null;
      await client.query(
        `UPDATE zenovel.project_visits SET sponsor_timeline_working_days=$2,sponsor_deadline_date=$3,updated_at=now() WHERE id=$1`,
        [visitId, workingDays, deadline],
      );
      await client.query(
        `INSERT INTO zenovel.project_timeline_overrides
         (id,project_id,visit_id,previous_working_days,new_working_days,previous_deadline_date,new_deadline_date,actor_user_id,reason)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          randomUUID(),
          row.projectId,
          visitId,
          row.sponsorTimelineWorkingDays,
          workingDays,
          row.sponsorDeadlineDate,
          deadline,
          actorId,
          reason,
        ],
      );
      return row;
    });
  }

  async milestone(
    visitId: string,
    type: MilestoneType,
    actorId: string,
    businessDate: string,
  ) {
    return this.db.transaction(async (client) => {
      const visit = await client.query<{
        projectId: string;
        sponsorDeadlineDate: string | null;
        sponsorReportOverdue: boolean;
      }>(
        `SELECT project_id AS "projectId",sponsor_deadline_date::text AS "sponsorDeadlineDate",
         sponsor_report_overdue AS "sponsorReportOverdue"
         FROM zenovel.project_visits WHERE id=$1 FOR UPDATE`,
        [visitId],
      );
      if (!visit.rows[0]) return null;
      const milestone = await client.query<{ id: string; occurredAt: string }>(
        `INSERT INTO zenovel.project_milestones(id,project_id,visit_id,milestone_type,actor_user_id)
         VALUES($1,$2,$3,$4,$5) RETURNING id,occurred_at AS "occurredAt"`,
        [randomUUID(), visit.rows[0].projectId, visitId, type, actorId],
      );
      const reportShared = type === 'REPORT_SHARED_TO_SPONSOR';
      const late = Boolean(
        reportShared &&
        !visit.rows[0].sponsorReportOverdue &&
        visit.rows[0].sponsorDeadlineDate &&
        visit.rows[0].sponsorDeadlineDate < businessDate,
      );
      const field = {
        FIRST_DRAFT_SUBMITTED: 'first_draft_submitted_at',
        REPORT_SHARED_TO_SPONSOR: 'report_shared_to_sponsor_at',
        SIGNED_REPORT_SHARED_TO_SPONSOR: 'signed_report_shared_at',
      }[type];
      const reportStatus =
        type === 'FIRST_DRAFT_SUBMITTED'
          ? 'INITIAL_DRAFT_SUBMITTED'
          : reportShared
            ? 'SPONSOR_SHARED'
            : null;
      await client.query(
        `UPDATE zenovel.project_visits SET ${field}=now(),
         report_status=CASE
           WHEN $3='INITIAL_DRAFT_SUBMITTED' AND report_status IN ('NOT_STARTED','DRAFT') THEN $3
           WHEN $3='SPONSOR_SHARED' AND report_status NOT IN ('CAPA_PENDING','CLOSED_ARCHIVED') THEN $3
           ELSE report_status END,
         sponsor_report_overdue=CASE WHEN $2 THEN true ELSE sponsor_report_overdue END,
         deviation_required=CASE WHEN $2 THEN true ELSE deviation_required END,
         overdue_raised_at=CASE WHEN $2 THEN COALESCE(overdue_raised_at,now()) ELSE overdue_raised_at END,
         updated_at=now() WHERE id=$1`,
        [visitId, late, reportStatus],
      );
      if (late) {
        const project = await client.query<{ pmUserId: string | null }>(
          'SELECT pm_user_id AS "pmUserId" FROM zenovel.projects WHERE id=$1',
          [visit.rows[0].projectId],
        );
        if (project.rows[0]?.pmUserId)
          await this.notify(
            client,
            project.rows[0].pmUserId,
            'SPONSOR_REPORT_OVERDUE',
            visit.rows[0].projectId,
            visitId,
            'A sponsor report was shared after its deadline and a deviation is required.',
            `/projects/${visit.rows[0].projectId}`,
            'HIGH',
          );
        await this.notifyRoles(
          client,
          ['QMS', 'ASSOCIATE_DIRECTOR_GCP'],
          'SPONSOR_REPORT_OVERDUE',
          visit.rows[0].projectId,
          visitId,
          'A sponsor report was shared after its deadline and a deviation is required.',
          `/projects/${visit.rows[0].projectId}`,
          'HIGH',
        );
        await this.overdueEvent(
          client,
          actorId,
          visit.rows[0].projectId,
          visitId,
        );
      }
      return {
        ...milestone.rows[0]!,
        projectId: visit.rows[0].projectId,
        late,
      };
    });
  }

  async correctMilestone(milestoneId: string, actorId: string, reason: string) {
    const result = await this.db.query<{ projectId: string }>(
      `WITH inserted AS (
       INSERT INTO zenovel.project_milestone_corrections(id,milestone_id,actor_user_id,reason)
       SELECT $1,m.id,$3,$4 FROM zenovel.project_milestones m WHERE m.id=$2 RETURNING milestone_id)
       SELECT m.project_id AS "projectId" FROM inserted i JOIN zenovel.project_milestones m ON m.id=i.milestone_id`,
      [randomUUID(), milestoneId, actorId, reason],
    );
    return result.rows[0] ?? null;
  }

  async raiseOverdue(businessDate: string) {
    return this.db.transaction(async (client) => {
      const lock = await client.query<{ locked: boolean }>(
        `SELECT pg_try_advisory_xact_lock(hashtext('zenovel-stage3-overdue-processing')) AS locked`,
      );
      if (!lock.rows[0]?.locked) return [];
      const raised = await client.query<{
        visitId: string;
        projectId: string;
        pmUserId: string | null;
      }>(
        `UPDATE zenovel.project_visits v SET sponsor_report_overdue=true,deviation_required=true,overdue_raised_at=now(),updated_at=now()
         FROM zenovel.projects p WHERE p.id=v.project_id AND v.sponsor_deadline_date<$1::date
         AND v.visit_end_date IS NOT NULL AND v.sponsor_deadline_date IS NOT NULL
         AND v.report_shared_to_sponsor_at IS NULL AND v.sponsor_report_overdue=false
         RETURNING v.id AS "visitId",v.project_id AS "projectId",p.pm_user_id AS "pmUserId"`,
        [businessDate],
      );
      for (const row of raised.rows) {
        if (row.pmUserId)
          await this.notify(
            client,
            row.pmUserId,
            'SPONSOR_REPORT_OVERDUE',
            row.projectId,
            row.visitId,
            'A sponsor report deadline is overdue and a deviation is required.',
            `/projects/${row.projectId}`,
            'HIGH',
          );
        await this.notifyRoles(
          client,
          ['QMS', 'ASSOCIATE_DIRECTOR_GCP'],
          'SPONSOR_REPORT_OVERDUE',
          row.projectId,
          row.visitId,
          'A sponsor report deadline is overdue and a deviation is required.',
          `/projects/${row.projectId}`,
          'HIGH',
        );
        await this.overdueEvent(client, null, row.projectId, row.visitId);
      }
      return raised.rows;
    });
  }

  async notifications(userId: string) {
    const result = await this.db.query(
      `SELECT id,notification_type AS "notificationType",project_id AS "projectId",visit_id AS "visitId",
       message,action_path AS "actionPath",priority,read_at AS "readAt",created_at AS "createdAt"
       FROM zenovel.notifications WHERE recipient_user_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [userId],
    );
    return result.rows;
  }

  async dashboard(access: ProjectAccess) {
    const result = await this.db.query<{
      total: string;
      preInitiation: string;
      active: string;
      completed: string;
      archived: string;
      visits: string;
      overdue: string;
      deviationRequired: string;
    }>(
      `SELECT count(DISTINCT p.id)::text AS total,
       count(DISTINCT p.id) FILTER (WHERE p.status='PRE_INITIATION')::text AS "preInitiation",
       count(DISTINCT p.id) FILTER (WHERE p.status='ACTIVE')::text AS active,
       count(DISTINCT p.id) FILTER (WHERE p.status='COMPLETED')::text AS completed,
       count(DISTINCT p.id) FILTER (WHERE p.status='ARCHIVED')::text AS archived,
       count(v.id)::text AS visits,
       count(v.id) FILTER (WHERE v.sponsor_report_overdue)::text AS overdue,
       count(v.id) FILTER (WHERE v.deviation_required)::text AS "deviationRequired"
       FROM zenovel.projects p LEFT JOIN zenovel.project_visits v ON v.project_id=p.id
       WHERE ${accessSql}`,
      [access.organizationWide, access.userId],
    );
    return Object.fromEntries(
      Object.entries(result.rows[0] ?? {}).map(([key, value]) => [
        key,
        Number(value),
      ]),
    );
  }

  private async notify(
    client: PoolClient,
    recipient: string,
    type: string,
    projectId: string,
    visitId: string | null,
    message: string,
    actionPath: string,
    priority = 'NORMAL',
  ) {
    const notificationId = randomUUID();
    const inserted = await client.query(
      `INSERT INTO zenovel.notifications
       (id,recipient_user_id,notification_type,project_id,visit_id,message,action_path,priority)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT DO NOTHING RETURNING id`,
      [
        notificationId,
        recipient,
        type,
        projectId,
        visitId,
        message,
        actionPath,
        priority,
      ],
    );
    if (inserted.rowCount === 1)
      await client.query(
        `INSERT INTO zenovel.security_events
         (id,subject_user_id,event_type,outcome,context)
         VALUES($1,$2,'notification_created','success',$3)`,
        [
          randomUUID(),
          recipient,
          JSON.stringify({ notificationId, type, projectId, visitId }),
        ],
      );
  }

  private async notifyRoles(
    client: PoolClient,
    roles: string[],
    type: string,
    projectId: string,
    visitId: string | null,
    message: string,
    actionPath: string,
    priority = 'NORMAL',
  ) {
    const users = await client.query<{ id: string }>(
      `SELECT DISTINCT u.id FROM zenovel.users u JOIN zenovel.user_roles ur ON ur.user_id=u.id
       JOIN zenovel.roles r ON r.id=ur.role_id WHERE u.status='active' AND r.code=ANY($1::text[])`,
      [roles],
    );
    for (const user of users.rows)
      await this.notify(
        client,
        user.id,
        type,
        projectId,
        visitId,
        message,
        actionPath,
        priority,
      );
  }

  private async overdueEvent(
    client: PoolClient,
    actorUserId: string | null,
    projectId: string,
    visitId: string,
  ) {
    await client.query(
      `INSERT INTO zenovel.security_events
       (id,actor_user_id,event_type,outcome,context)
       VALUES($1,$2,'sponsor_report_overdue_raised','success',$3)`,
      [randomUUID(), actorUserId, JSON.stringify({ projectId, visitId })],
    );
  }
}
