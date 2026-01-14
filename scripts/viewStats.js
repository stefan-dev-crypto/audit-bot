#!/usr/bin/env node

/**
 * View Audit Statistics
 * Displays current audit statistics from audit-statistics.json
 */

import { AuditStatistics } from '../src/storage/auditStatistics.js';

const statistics = new AuditStatistics();
statistics.displayStats();

// Additional detailed view
const stats = statistics.getStats();

console.log('\n📈 Additional Details:');
console.log(`Pending Audit: ${stats.pendingAudit} contracts`);
console.log(`Vulnerability Rate: ${stats.vulnerabilityRate}`);
console.log(`Clean Rate: ${stats.cleanRate}`);

if (stats.history && stats.history.length > 0) {
  console.log(`\n📜 Recent History (last ${Math.min(10, stats.history.length)} entries):`);
  stats.history.slice(-10).forEach((entry, idx) => {
    console.log(`   ${idx + 1}. ${entry.timestamp}: ${JSON.stringify(entry)}`);
  });
}
