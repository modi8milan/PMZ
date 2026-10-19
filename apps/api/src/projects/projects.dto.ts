import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  CAPA_STATUSES,
  MILESTONE_TYPES,
  PROJECT_STATUSES,
  REPORT_STATUSES,
  VISIT_STATUSES,
} from './projects.types.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const clean = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateProjectDto {
  @Transform(clean)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  inHouseProjectId!: string;
  @Transform(clean)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  sponsorProjectId!: string;
  @Transform(clean)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  sponsorName!: string;
  @Transform(clean)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  clientCode!: string;
  @Transform(clean) @IsString() @MinLength(2) @MaxLength(300) title!: string;
  @Transform(clean)
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  projectDetail?: string;
  @Transform(clean)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  regulatorySubmissionDetails?: string;
  @Transform(clean) @IsOptional() @IsString() @MaxLength(200) croName?: string;
  @Transform(clean)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  clinicalSite?: string;
  @Transform(clean)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  bioanalyticalFacility?: string;
  @Matches(DATE) receiptDate!: string;
  @IsOptional() @Matches(DATE) tentativeStartDate?: string;
  @Transform(clean) @IsOptional() @IsString() @MaxLength(120) category?: string;
  @IsUUID() pmUserId!: string;
  @IsOptional() @IsUUID() provisionalMonitorId?: string;
}

export class ProjectQueryDto {
  @Transform(clean) @IsOptional() @IsString() @MaxLength(200) sponsor?: string;
  @Transform(clean)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  projectId?: string;
  @Transform(clean)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  inHouseProjectId?: string;
  @Transform(clean) @IsOptional() @IsString() @MaxLength(300) title?: string;
  @Transform(clean) @IsOptional() @IsString() @MaxLength(300) location?: string;
  @IsOptional() @IsUUID() projectManagerId?: string;
  @IsOptional() @IsIn(PROJECT_STATUSES) status?: string;
  @IsOptional() @Matches(DATE) from?: string;
  @IsOptional() @Matches(DATE) to?: string;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(100) pageSize = 25;
  @IsOptional() @IsIn(['serialNo', 'title', 'receiptDate', 'status']) sort =
    'serialNo';
  @IsOptional() @IsIn(['asc', 'desc']) direction = 'asc';
}

export class TrackerQueryDto extends ProjectQueryDto {
  @IsOptional()
  @IsIn([
    'serialNo',
    'title',
    'receiptDate',
    'status',
    'visitSequence',
    'visitEndDate',
    'sponsorDeadlineDate',
  ])
  sort = 'serialNo';
  @Transform(clean)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  visitType?: string;
  @IsOptional() @IsUUID() monitorId?: string;
  @IsOptional() @IsIn(VISIT_STATUSES) visitStatus?: string;
  @IsOptional() @IsIn(REPORT_STATUSES) reportStatus?: string;
  @IsOptional() @IsIn(CAPA_STATUSES) capaStatus?: string;
}

export class AssignmentResponseDto {
  @IsIn(['accept', 'decline', 'return']) decision!:
    'accept' | 'decline' | 'return';
  @Transform(clean) @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class ProjectStatusDto {
  @IsIn(PROJECT_STATUSES) status!: (typeof PROJECT_STATUSES)[number];
  @Transform(clean) @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class TransferProjectDto {
  @IsUUID() newPmUserId!: string;
  @Transform(clean) @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class CreateVisitDto {
  @Transform(clean)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  visitType!: string;
  @IsOptional() @IsUUID() monitorUserId?: string;
  @IsOptional()
  @IsIn(VISIT_STATUSES)
  visitStatus?: (typeof VISIT_STATUSES)[number];
  @IsOptional()
  @IsIn(REPORT_STATUSES)
  reportStatus?: (typeof REPORT_STATUSES)[number];
  @IsOptional()
  @IsIn(CAPA_STATUSES)
  capaStatus?: (typeof CAPA_STATUSES)[number];
  @IsOptional() @IsBoolean() agendaShared?: boolean;
  @Transform(clean)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reportFromMonitor?: string;
  @IsOptional() @Matches(DATE) visitEndDate?: string;
  @Transform(clean)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sponsorApproval?: string;
  @Transform(clean)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  mfrToCro?: string;
  @Transform(clean)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  capaFromCro?: string;
  @IsOptional() @Matches(DATE) capaReceivedDate?: string;
  @Transform(clean)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  studyResult?: string;
  @Transform(clean)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceDocumentsStatus?: string;
  @Transform(clean)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  qmsArchivalSubmission?: string;
  @Transform(clean)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comments?: string;
  @IsOptional() @Matches(DATE) finalArchivalDate?: string;
}

export class TimelineOverrideDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(60) workingDays!: number;
  @Transform(clean) @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class MilestoneDto {
  @IsIn(MILESTONE_TYPES)
  milestoneType!: (typeof MILESTONE_TYPES)[number];
}

export class MilestoneCorrectionDto {
  @Transform(clean) @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class ExportQueryDto extends TrackerQueryDto {
  @IsIn(['csv', 'xlsx']) format!: 'csv' | 'xlsx';
}
