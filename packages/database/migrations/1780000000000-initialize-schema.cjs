exports.up = (pgm) => {
  pgm.createSchema('zenovel');
};
// Non-cascading rollback is provided for review, never exposed as a reset script.
exports.down = (pgm) => {
  pgm.dropSchema('zenovel');
};
