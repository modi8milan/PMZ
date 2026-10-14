const departments = [
  [
    '10000000-0000-4000-8000-000000000001',
    'CRD',
    'Clinical Research Department',
  ],
  ['10000000-0000-4000-8000-000000000002', 'QMS', 'Quality Management System'],
  [
    '10000000-0000-4000-8000-000000000003',
    'ITD',
    'Information Technology Department',
  ],
  ['10000000-0000-4000-8000-000000000004', 'MANAGEMENT', 'Management'],
];

const roles = [
  [
    '20000000-0000-4000-8000-000000000001',
    'ASSOCIATE_DIRECTOR_GCP',
    'Associate Director GCP',
    true,
  ],
  [
    '20000000-0000-4000-8000-000000000002',
    'PROJECT_MANAGER',
    'Project Manager',
    false,
  ],
  [
    '20000000-0000-4000-8000-000000000003',
    'CRA_MONITOR',
    'CRA / Monitor',
    false,
  ],
  ['20000000-0000-4000-8000-000000000004', 'QMS', 'QMS', false],
  ['20000000-0000-4000-8000-000000000005', 'DIRECTOR', 'Director', true],
  [
    '20000000-0000-4000-8000-000000000006',
    'DIRECTOR_OPERATIONS',
    'Director of Operations',
    true,
  ],
  [
    '20000000-0000-4000-8000-000000000007',
    'SYSTEM_ADMINISTRATOR',
    'System Administrator',
    true,
  ],
  [
    '20000000-0000-4000-8000-000000000008',
    'BUSINESS_QUALITY_CONFIG_ADMIN',
    'Business/Quality Configuration Administrator',
    true,
  ],
];

const permissions = [
  'View',
  'Create',
  'Edit',
  'Comment',
  'Respond',
  'Review',
  'Verify',
  'Approve',
  'Download',
  'Export',
  'Assign',
  'TransferOwnership',
  'Configure',
  'Administer',
  'AuditReview',
  'Archive',
  'ReopenRequest',
  'ElectronicSign',
];

const grants = {
  ASSOCIATE_DIRECTOR_GCP: [
    'View',
    'Create',
    'Review',
    'Download',
    'Export',
    'Assign',
    'TransferOwnership',
  ],
  PROJECT_MANAGER: [
    'View',
    'Create',
    'Edit',
    'Comment',
    'Review',
    'Verify',
    'Approve',
    'Download',
    'Export',
    'Assign',
  ],
  CRA_MONITOR: ['View', 'Edit', 'Comment', 'Respond'],
  QMS: [
    'View',
    'Comment',
    'Review',
    'Verify',
    'Download',
    'Export',
    'AuditReview',
  ],
  DIRECTOR: ['View', 'Review'],
  DIRECTOR_OPERATIONS: ['View', 'Approve', 'ElectronicSign'],
  SYSTEM_ADMINISTRATOR: ['View', 'Administer', 'AuditReview'],
  BUSINESS_QUALITY_CONFIG_ADMIN: ['View', 'Configure'],
};

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE zenovel.departments (
      id uuid PRIMARY KEY,
      code varchar(40) NOT NULL UNIQUE,
      name varchar(160) NOT NULL,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE zenovel.users (
      id uuid PRIMARY KEY,
      username varchar(100) NOT NULL,
      full_name varchar(160) NOT NULL,
      email varchar(254),
      department_id uuid REFERENCES zenovel.departments(id),
      status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      password_hash text NOT NULL,
      password_changed_at timestamptz NOT NULL DEFAULT now(),
      password_expires_at timestamptz NOT NULL,
      must_change_password boolean NOT NULL DEFAULT true,
      failed_login_attempts integer NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
      locked_until timestamptz,
      mfa_secret_encrypted text,
      mfa_enabled boolean NOT NULL DEFAULT false,
      auth_version integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deactivated_at timestamptz,
      CONSTRAINT users_email_format CHECK (email IS NULL OR position('@' in email) > 1)
    );
    CREATE UNIQUE INDEX users_username_lower_unique ON zenovel.users (lower(username));
    CREATE UNIQUE INDEX users_email_lower_unique ON zenovel.users (lower(email)) WHERE email IS NOT NULL;
    CREATE TABLE zenovel.roles (
      id uuid PRIMARY KEY,
      code varchar(80) NOT NULL UNIQUE,
      name varchar(160) NOT NULL,
      active boolean NOT NULL DEFAULT true,
      mfa_required boolean NOT NULL DEFAULT false,
      system_role boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE zenovel.permissions (
      id uuid PRIMARY KEY,
      code varchar(80) NOT NULL UNIQUE,
      description varchar(240) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE zenovel.user_roles (
      user_id uuid NOT NULL REFERENCES zenovel.users(id) ON DELETE CASCADE,
      role_id uuid NOT NULL REFERENCES zenovel.roles(id),
      assigned_by uuid REFERENCES zenovel.users(id),
      assigned_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, role_id)
    );
    CREATE INDEX user_roles_role_id_idx ON zenovel.user_roles(role_id);
    CREATE TABLE zenovel.role_permissions (
      role_id uuid NOT NULL REFERENCES zenovel.roles(id) ON DELETE CASCADE,
      permission_id uuid NOT NULL REFERENCES zenovel.permissions(id) ON DELETE CASCADE,
      granted_by uuid REFERENCES zenovel.users(id),
      granted_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (role_id, permission_id)
    );
    CREATE INDEX role_permissions_permission_idx ON zenovel.role_permissions(permission_id);
    CREATE TABLE zenovel.password_history (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES zenovel.users(id) ON DELETE CASCADE,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX password_history_user_recent_idx ON zenovel.password_history(user_id, created_at DESC);
    CREATE TABLE zenovel.sessions (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES zenovel.users(id) ON DELETE CASCADE,
      token_hash char(64) NOT NULL UNIQUE,
      csrf_token_hash char(64) NOT NULL,
      auth_version integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      idle_expires_at timestamptz NOT NULL,
      absolute_expires_at timestamptz NOT NULL,
      revoked_at timestamptz,
      revoked_reason varchar(80),
      ip_hash char(64),
      user_agent_hash char(64)
    );
    CREATE INDEX sessions_user_active_idx ON zenovel.sessions(user_id, revoked_at, absolute_expires_at);
    CREATE TABLE zenovel.password_reset_tokens (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES zenovel.users(id) ON DELETE CASCADE,
      token_hash char(64) NOT NULL UNIQUE,
      created_by uuid REFERENCES zenovel.users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      requires_password_change boolean NOT NULL DEFAULT false
    );
    CREATE INDEX password_reset_user_idx ON zenovel.password_reset_tokens(user_id, expires_at DESC);
    CREATE TABLE zenovel.mfa_recovery_codes (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES zenovel.users(id) ON DELETE CASCADE,
      code_hash char(64) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      used_at timestamptz,
      UNIQUE(user_id, code_hash)
    );
    CREATE TABLE zenovel.security_events (
      id uuid PRIMARY KEY,
      actor_user_id uuid REFERENCES zenovel.users(id),
      subject_user_id uuid REFERENCES zenovel.users(id),
      event_type varchar(100) NOT NULL,
      outcome varchar(20) NOT NULL CHECK (outcome IN ('success', 'failure', 'denied')),
      request_id uuid,
      correlation_id uuid,
      context jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX security_events_created_idx ON zenovel.security_events(created_at DESC);
    CREATE INDEX security_events_actor_idx ON zenovel.security_events(actor_user_id, created_at DESC);
    CREATE INDEX security_events_subject_idx ON zenovel.security_events(subject_user_id, created_at DESC);
  `);

  for (const [id, code, name] of departments) {
    pgm.sql(
      `INSERT INTO zenovel.departments(id, code, name) VALUES ('${id}', '${code}', '${name}')`,
    );
  }
  for (const [id, code, name, mfaRequired] of roles) {
    pgm.sql(
      `INSERT INTO zenovel.roles(id, code, name, mfa_required, system_role) VALUES ('${id}', '${code}', '${name.replaceAll("'", "''")}', ${mfaRequired}, true)`,
    );
  }
  permissions.forEach((code, index) => {
    const suffix = String(index + 1).padStart(12, '0');
    pgm.sql(
      `INSERT INTO zenovel.permissions(id, code, description) VALUES ('30000000-0000-4000-8000-${suffix}', '${code}', '${code} permission')`,
    );
  });
  for (const [roleCode, codes] of Object.entries(grants)) {
    for (const code of codes) {
      pgm.sql(`
        INSERT INTO zenovel.role_permissions(role_id, permission_id)
        SELECT r.id, p.id FROM zenovel.roles r CROSS JOIN zenovel.permissions p
        WHERE r.code = '${roleCode}' AND p.code = '${code}'
      `);
    }
  }
};

exports.down = (pgm) => {
  for (const table of [
    'security_events',
    'mfa_recovery_codes',
    'password_reset_tokens',
    'sessions',
    'password_history',
    'role_permissions',
    'user_roles',
    'permissions',
    'roles',
    'users',
    'departments',
  ])
    pgm.dropTable({ schema: 'zenovel', name: table });
};
