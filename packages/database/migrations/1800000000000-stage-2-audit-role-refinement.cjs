exports.up = (pgm) => {
  pgm.addColumn(
    { schema: 'zenovel', name: 'roles' },
    {
      description: { type: 'varchar(500)' },
    },
  );
  pgm.addColumn(
    { schema: 'zenovel', name: 'security_events' },
    {
      reason: { type: 'varchar(500)' },
    },
  );
  pgm.createIndex(
    { schema: 'zenovel', name: 'security_events' },
    ['created_at', 'actor_user_id'],
    {
      name: 'security_events_filter_idx',
    },
  );
};

exports.down = (pgm) => {
  pgm.dropIndex(
    { schema: 'zenovel', name: 'security_events' },
    ['created_at', 'actor_user_id'],
    {
      name: 'security_events_filter_idx',
    },
  );
  pgm.dropColumn({ schema: 'zenovel', name: 'security_events' }, 'reason');
  pgm.dropColumn({ schema: 'zenovel', name: 'roles' }, 'description');
};
