exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE zenovel.visit_types (
      id uuid PRIMARY KEY,
      display_name varchar(120) NOT NULL,
      normalized_name varchar(120) NOT NULL,
      active boolean NOT NULL DEFAULT true,
      created_by uuid REFERENCES zenovel.users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid REFERENCES zenovel.users(id),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(normalized_name)
    );

    INSERT INTO zenovel.visit_types(id,display_name,normalized_name)
    SELECT gen_random_uuid(), value, lower(value)
    FROM unnest(ARRAY['SIV','P01','P02','P03','P04','Parallel','IPBM','RTBM','SCV','QA Visit']) value;

    CREATE TABLE zenovel.clients (
      id uuid PRIMARY KEY,
      name varchar(200) NOT NULL,
      code varchar(80) NOT NULL,
      normalized_name varchar(200) NOT NULL,
      normalized_code varchar(80) NOT NULL,
      active boolean NOT NULL DEFAULT true,
      created_by uuid REFERENCES zenovel.users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid REFERENCES zenovel.users(id),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(normalized_name),
      UNIQUE(normalized_code)
    );

    INSERT INTO zenovel.clients(id,name,code,normalized_name,normalized_code,created_by)
    SELECT gen_random_uuid(),min(trim(p.sponsor_name)),min(trim(p.client_code)),
      lower(trim(p.sponsor_name)),lower(trim(p.client_code)),min(p.created_by::text)::uuid
    FROM zenovel.projects p
    GROUP BY lower(trim(p.sponsor_name)),lower(trim(p.client_code));

    ALTER TABLE zenovel.projects ADD COLUMN client_id uuid REFERENCES zenovel.clients(id);
    UPDATE zenovel.projects p SET client_id=c.id
    FROM zenovel.clients c
    WHERE c.normalized_name=lower(trim(p.sponsor_name)) AND c.normalized_code=lower(trim(p.client_code));
    CREATE INDEX projects_client_idx ON zenovel.projects(client_id,serial_no);

    ALTER TABLE zenovel.project_visits
      ADD COLUMN visit_type_id uuid REFERENCES zenovel.visit_types(id),
      ADD COLUMN visit_start_date date;
    UPDATE zenovel.project_visits v SET visit_type_id=t.id
    FROM zenovel.visit_types t WHERE t.normalized_name=lower(trim(v.visit_type));
    INSERT INTO zenovel.visit_types(id,display_name,normalized_name,active)
    SELECT gen_random_uuid(),min(trim(v.visit_type)),lower(trim(v.visit_type)),false
    FROM zenovel.project_visits v
    WHERE v.visit_type_id IS NULL
    GROUP BY lower(trim(v.visit_type))
    ON CONFLICT (normalized_name) DO NOTHING;
    UPDATE zenovel.project_visits v SET visit_type_id=t.id
    FROM zenovel.visit_types t
    WHERE v.visit_type_id IS NULL AND t.normalized_name=lower(trim(v.visit_type));
    ALTER TABLE zenovel.project_visits
      ADD CONSTRAINT project_visits_date_order CHECK (
        visit_start_date IS NULL OR visit_end_date IS NULL OR visit_end_date >= visit_start_date
      );
    CREATE INDEX project_visits_type_idx ON zenovel.project_visits(visit_type_id,visit_status);

    CREATE TABLE zenovel.project_visit_date_history (
      id uuid PRIMARY KEY,
      visit_id uuid NOT NULL REFERENCES zenovel.project_visits(id) ON DELETE CASCADE,
      previous_start_date date,
      new_start_date date,
      previous_end_date date,
      new_end_date date,
      previous_deadline_date date,
      new_deadline_date date,
      actor_user_id uuid NOT NULL REFERENCES zenovel.users(id),
      reason varchar(500) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
};

exports.down = (pgm) => {
  pgm.dropTable({ schema: 'zenovel', name: 'project_visit_date_history' });
  pgm.sql(`
    ALTER TABLE zenovel.project_visits DROP CONSTRAINT project_visits_date_order;
    DROP INDEX zenovel.project_visits_type_idx;
    ALTER TABLE zenovel.project_visits DROP COLUMN visit_start_date, DROP COLUMN visit_type_id;
    DROP INDEX zenovel.projects_client_idx;
    ALTER TABLE zenovel.projects DROP COLUMN client_id;
  `);
  pgm.dropTable({ schema: 'zenovel', name: 'clients' });
  pgm.dropTable({ schema: 'zenovel', name: 'visit_types' });
};
