import type { AuthUser } from '../auth/auth.types.js';

export const PROJECT_STATUSES = [
  'PRE_INITIATION',
  'ACTIVE',
  'ON_HOLD',
  'COMPLETED',
  'ARCHIVED',
  'CANCELLED',
] as const;
export const VISIT_STATUSES = [
  'PLANNED',
  'ONGOING',
  'COMPLETED',
  'CANCELLED',
] as const;
export const REPORT_STATUSES = [
  'NOT_STARTED',
  'DRAFT',
  'INITIAL_DRAFT_SUBMITTED',
  'PM_REVIEW',
  'CRA_CORRECTION',
  'PM_VERIFICATION',
  'QMS_REVIEW',
  'QMS_CORRECTION',
  'QMS_VERIFIED',
  'AWAITING_DIRECTOR_APPROVAL',
  'FINAL_APPROVED',
  'SPONSOR_SHARED',
  'CAPA_PENDING',
  'CLOSED_ARCHIVED',
] as const;
export const CAPA_STATUSES = [
  'NOT_APPLICABLE',
  'PENDING',
  'RECEIVED',
  'CLOSED',
] as const;
export const MILESTONE_TYPES = [
  'FIRST_DRAFT_SUBMITTED',
  'REPORT_SHARED_TO_SPONSOR',
  'SIGNED_REPORT_SHARED_TO_SPONSOR',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type VisitStatus = (typeof VISIT_STATUSES)[number];
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export type CapaStatus = (typeof CAPA_STATUSES)[number];
export type MilestoneType = (typeof MILESTONE_TYPES)[number];

export type ProjectAccess = {
  userId: string;
  organizationWide: boolean;
  redactSponsor: boolean;
  projectManager: boolean;
};

export function projectAccess(user: AuthUser): ProjectAccess | null {
  const organizationWide = user.roles.some((role) =>
    [
      'ASSOCIATE_DIRECTOR_GCP',
      'QMS',
      'DIRECTOR',
      'DIRECTOR_OPERATIONS',
    ].includes(role),
  );
  const projectManager = user.roles.includes('PROJECT_MANAGER');
  const monitor = user.roles.includes('CRA_MONITOR');
  if (!organizationWide && !projectManager && !monitor) return null;
  return {
    userId: user.id,
    organizationWide,
    redactSponsor: monitor && !organizationWide && !projectManager,
    projectManager,
  };
}

export type ProjectRow = {
  id: string;
  serialNo: string;
  inHouseProjectId: string;
  sponsorProjectId: string;
  sponsorName: string | null;
  clientCode: string;
  clientId: string | null;
  title: string;
  projectDetail: string | null;
  regulatorySubmissionDetails: string | null;
  croName: string | null;
  clinicalSite: string | null;
  bioanalyticalFacility: string | null;
  receiptDate: string;
  tentativeStartDate: string | null;
  category: string | null;
  status: ProjectStatus;
  assignmentState: string;
  pmUserId: string | null;
  pmName: string | null;
  provisionalMonitorId: string | null;
  provisionalMonitorName: string | null;
  visitCount: number;
  createdAt: string;
};

export type TrackerRow = ProjectRow & {
  visitId: string | null;
  visitSequence: number | null;
  visitType: string | null;
  visitTypeId: string | null;
  visitStatus: VisitStatus | null;
  reportStatus: ReportStatus | null;
  capaStatus: CapaStatus | null;
  monitorName: string | null;
  agendaShared: boolean | null;
  reportFromMonitor: string | null;
  visitStartDate: string | null;
  visitEndDate: string | null;
  visitEndRecordedAt: string | null;
  firstDraftSubmittedAt: string | null;
  reportSharedToSponsorAt: string | null;
  signedReportSharedAt: string | null;
  sponsorApproval: string | null;
  mfrToCro: string | null;
  capaFromCro: string | null;
  capaReceivedDate: string | null;
  studyResult: string | null;
  sourceDocumentsStatus: string | null;
  qmsArchivalSubmission: string | null;
  comments: string | null;
  finalArchivalDate: string | null;
  sponsorTimelineWorkingDays: number | null;
  sponsorDeadlineDate: string | null;
  sponsorReportOverdue: boolean | null;
  deviationRequired: boolean | null;
  deviationReported: boolean | null;
};

export type VisitTypeRow = {
  id: string;
  displayName: string;
  active: boolean;
  inUse: boolean;
};

export type ClientRow = {
  id: string;
  name: string;
  code: string;
  active: boolean;
  inUse: boolean;
};
