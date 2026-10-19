exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE zenovel.projects (
      id uuid PRIMARY KEY,
      serial_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
      in_house_project_id varchar(100) NOT NULL,
      sponsor_project_id varchar(100) NOT NULL,
      sponsor_name varchar(200) NOT NULL,
      client_code varchar(80) NOT NULL,
      title varchar(300) NOT NULL,
      project_detail text,
      regulatory_submission_details text,
      cro_name varchar(200),
      clinical_site varchar(300),
      bioanalytical_facility varchar(300),
      receipt_date date NOT NULL,
      tentative_start_date date,
      category varchar(120),
      status varchar(30) NOT NULL DEFAULT 'PRE_INITIATION'
        CHECK (status IN ('PRE_INITIATION','ACTIVE','ON_HOLD','COMPLETED','ARCHIVED','CANCELLED')),
      assignment_state varchar(20) NOT NULL DEFAULT 'PENDING'
        CHECK (assignment_state IN ('PENDING','ACCEPTED','DECLINED','RETURNED','UNASSIGNED')),
      pm_user_id uuid REFERENCES zenovel.users(id),
      provisional_monitor_id uuid REFERENCES zenovel.users(id),
      created_by uuid NOT NULL REFERENCES zenovel.users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX projects_in_house_id_unique ON zenovel.projects(lower(in_house_project_id));
    CREATE UNIQUE INDEX projects_client_sponsor_id_unique ON zenovel.projects(lower(client_code),lower(sponsor_project_id));
    CREATE INDEX projects_pm_status_idx ON zenovel.projects(pm_user_id,status,serial_no);
    CREATE INDEX projects_monitor_idx ON zenovel.projects(provisional_monitor_id,serial_no);

    CREATE TABLE zenovel.project_assignments (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES zenovel.projects(id) ON DELETE CASCADE,
      pm_user_id uuid NOT NULL REFERENCES zenovel.users(id),
      state varchar(20) NOT NULL CHECK (state IN ('PENDING','ACCEPTED','DECLINED','RETURNED','TRANSFERRED')),
      assigned_by uuid NOT NULL REFERENCES zenovel.users(id),
      assigned_at timestamptz NOT NULL DEFAULT now(),
      responded_at timestamptz,
      response_reason varchar(500),
      ended_at timestamptz
    );
    CREATE UNIQUE INDEX project_assignments_current_unique ON zenovel.project_assignments(project_id) WHERE ended_at IS NULL;
    CREATE INDEX project_assignments_pm_idx ON zenovel.project_assignments(pm_user_id,state,assigned_at DESC);

    CREATE TABLE zenovel.project_status_history (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES zenovel.projects(id) ON DELETE CASCADE,
      previous_status varchar(30),
      new_status varchar(30) NOT NULL,
      actor_user_id uuid NOT NULL REFERENCES zenovel.users(id),
      reason varchar(500),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE zenovel.working_calendar_days (
      calendar_date date PRIMARY KEY,
      is_working_day boolean NOT NULL,
      reason varchar(200),
      updated_by uuid REFERENCES zenovel.users(id),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE zenovel.project_visits (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES zenovel.projects(id) ON DELETE CASCADE,
      visit_sequence integer NOT NULL CHECK (visit_sequence > 0),
      visit_type varchar(120) NOT NULL,
      visit_status varchar(30) NOT NULL DEFAULT 'PLANNED'
        CHECK (visit_status IN ('PLANNED','ONGOING','COMPLETED','CANCELLED')),
      report_status varchar(40) NOT NULL DEFAULT 'NOT_STARTED'
        CHECK (report_status IN ('NOT_STARTED','DRAFT','INITIAL_DRAFT_SUBMITTED','PM_REVIEW','CRA_CORRECTION','PM_VERIFICATION','QMS_REVIEW','QMS_CORRECTION','QMS_VERIFIED','AWAITING_DIRECTOR_APPROVAL','FINAL_APPROVED','SPONSOR_SHARED','CAPA_PENDING','CLOSED_ARCHIVED')),
      capa_status varchar(30) NOT NULL DEFAULT 'NOT_APPLICABLE'
        CHECK (capa_status IN ('NOT_APPLICABLE','PENDING','RECEIVED','CLOSED')),
      monitor_user_id uuid REFERENCES zenovel.users(id),
      agenda_shared boolean NOT NULL DEFAULT false,
      report_from_monitor text,
      visit_end_date date,
      visit_end_recorded_at timestamptz,
      first_draft_submitted_at timestamptz,
      report_shared_to_sponsor_at timestamptz,
      signed_report_shared_at timestamptz,
      sponsor_approval varchar(200),
      mfr_to_cro text,
      capa_from_cro text,
      capa_received_date date,
      study_result text,
      source_documents_status varchar(200),
      qms_archival_submission varchar(200),
      comments text,
      final_archival_date date,
      sponsor_timeline_working_days integer NOT NULL DEFAULT 5 CHECK (sponsor_timeline_working_days BETWEEN 1 AND 60),
      sponsor_deadline_date date,
      sponsor_report_overdue boolean NOT NULL DEFAULT false,
      deviation_required boolean NOT NULL DEFAULT false,
      deviation_reported boolean NOT NULL DEFAULT false,
      overdue_raised_at timestamptz,
      created_by uuid NOT NULL REFERENCES zenovel.users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(project_id,visit_sequence)
    );
    CREATE INDEX project_visits_project_idx ON zenovel.project_visits(project_id,visit_sequence);
    CREATE INDEX project_visits_monitor_idx ON zenovel.project_visits(monitor_user_id,visit_status);
    CREATE INDEX project_visits_deadline_idx ON zenovel.project_visits(sponsor_deadline_date,report_shared_to_sponsor_at) WHERE sponsor_deadline_date IS NOT NULL;

    CREATE TABLE zenovel.project_timeline_overrides (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES zenovel.projects(id) ON DELETE CASCADE,
      visit_id uuid NOT NULL REFERENCES zenovel.project_visits(id) ON DELETE CASCADE,
      previous_working_days integer NOT NULL,
      new_working_days integer NOT NULL CHECK (new_working_days BETWEEN 1 AND 60),
      previous_deadline_date date,
      new_deadline_date date,
      actor_user_id uuid NOT NULL REFERENCES zenovel.users(id),
      reason varchar(500) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE zenovel.project_milestones (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES zenovel.projects(id) ON DELETE CASCADE,
      visit_id uuid REFERENCES zenovel.project_visits(id) ON DELETE CASCADE,
      milestone_type varchar(60) NOT NULL CHECK (milestone_type IN ('FIRST_DRAFT_SUBMITTED','REPORT_SHARED_TO_SPONSOR','SIGNED_REPORT_SHARED_TO_SPONSOR')),
      occurred_at timestamptz NOT NULL DEFAULT now(),
      actor_user_id uuid NOT NULL REFERENCES zenovel.users(id),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX project_milestones_once_idx ON zenovel.project_milestones(visit_id,milestone_type);

    CREATE TABLE zenovel.project_milestone_corrections (
      id uuid PRIMARY KEY,
      milestone_id uuid NOT NULL REFERENCES zenovel.project_milestones(id),
      actor_user_id uuid NOT NULL REFERENCES zenovel.users(id),
      reason varchar(500) NOT NULL,
      recorded_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE zenovel.project_ownership_transfers (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES zenovel.projects(id),
      previous_pm_user_id uuid NOT NULL REFERENCES zenovel.users(id),
      new_pm_user_id uuid NOT NULL REFERENCES zenovel.users(id),
      actor_user_id uuid NOT NULL REFERENCES zenovel.users(id),
      reason varchar(500) NOT NULL,
      transferred_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE zenovel.notifications (
      id uuid PRIMARY KEY,
      recipient_user_id uuid NOT NULL REFERENCES zenovel.users(id) ON DELETE CASCADE,
      notification_type varchar(80) NOT NULL,
      project_id uuid REFERENCES zenovel.projects(id) ON DELETE CASCADE,
      visit_id uuid REFERENCES zenovel.project_visits(id) ON DELETE CASCADE,
      message varchar(500) NOT NULL,
      action_path varchar(300),
      priority varchar(20) NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL','HIGH')),
      read_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX notifications_recipient_idx ON zenovel.notifications(recipient_user_id,read_at,created_at DESC);
    CREATE UNIQUE INDEX notifications_overdue_once_idx
      ON zenovel.notifications(recipient_user_id,notification_type,visit_id)
      WHERE notification_type='SPONSOR_REPORT_OVERDUE' AND visit_id IS NOT NULL;
  `);
};

exports.down = (pgm) => {
  for (const table of [
    'notifications',
    'project_ownership_transfers',
    'project_milestone_corrections',
    'project_milestones',
    'project_timeline_overrides',
    'project_visits',
    'working_calendar_days',
    'project_status_history',
    'project_assignments',
    'projects',
  ])
    pgm.dropTable({ schema: 'zenovel', name: table });
};
