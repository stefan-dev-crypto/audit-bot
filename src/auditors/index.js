// Auditors Module
// Exports all auditors and the audit manager

const BaseAuditor = require('./baseAuditor');
const SlitherAuditor = require('./slitherAuditor');
const AuditManager = require('./auditManager');

module.exports = {
  BaseAuditor,
  SlitherAuditor,
  AuditManager,
};
