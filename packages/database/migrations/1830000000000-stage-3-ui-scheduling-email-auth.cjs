exports.up = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS zenovel.users_email_lower_unique;
    CREATE UNIQUE INDEX users_email_normalized_unique
      ON zenovel.users (lower(btrim(email))) WHERE email IS NOT NULL;

    ALTER TABLE zenovel.users
      ADD CONSTRAINT users_email_normalized
      CHECK (email IS NULL OR email = lower(btrim(email)));

    CREATE TABLE zenovel.password_reset_requests (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES zenovel.users(id) ON DELETE CASCADE,
      status varchar(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','ISSUED','REJECTED')),
      source_ip_hash varchar(64),
      requested_at timestamptz NOT NULL DEFAULT now(),
      reviewed_by uuid REFERENCES zenovel.users(id),
      reviewed_at timestamptz,
      review_reason varchar(500),
      reset_token_id uuid REFERENCES zenovel.password_reset_tokens(id),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX password_reset_requests_pending_user_unique
      ON zenovel.password_reset_requests(user_id) WHERE status='PENDING';
    CREATE INDEX password_reset_requests_status_requested_idx
      ON zenovel.password_reset_requests(status,requested_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.dropTable({ schema: 'zenovel', name: 'password_reset_requests' });
  pgm.sql(`
    ALTER TABLE zenovel.users DROP CONSTRAINT IF EXISTS users_email_normalized;
    DROP INDEX IF EXISTS zenovel.users_email_normalized_unique;
    CREATE UNIQUE INDEX users_email_lower_unique
      ON zenovel.users (lower(email)) WHERE email IS NOT NULL;
  `);
};
