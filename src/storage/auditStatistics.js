/**
 * Audit Statistics Tracker
 * Records and manages statistics about contract fetching and auditing
 */

import fs from 'fs';
import path from 'path';

export class AuditStatistics {
  constructor(dataDir = './data') {
    this.dataDir = dataDir;
    this.statsFile = path.join(dataDir, 'audit-statistics.json');
    this.stats = this.loadStats();
  }

  /**
   * Load statistics from file
   * @returns {Object} Statistics object
   */
  loadStats() {
    try {
      if (fs.existsSync(this.statsFile)) {
        const data = fs.readFileSync(this.statsFile, 'utf8');
        const stats = JSON.parse(data);
        
        // Rebuild statistics from audited-contracts.json to ensure accuracy
        this.rebuildFromAuditedContracts(stats);
        
        return stats;
      }
    } catch (error) {
      console.error('Error loading statistics:', error.message);
    }

    // Default statistics
    const defaultStats = {
      totalFetched: 0,
      totalAudited: 0,
      withVulnerabilities: 0,
      withoutVulnerabilities: 0,
      failed: 0,
      lastUpdated: new Date().toISOString(),
      history: []
    };
    
    // Try to rebuild from audited contracts
    this.rebuildFromAuditedContracts(defaultStats);
    
    return defaultStats;
  }

  /**
   * Rebuild statistics from audited-contracts.json
   * @param {Object} stats - Statistics object to update
   */
  rebuildFromAuditedContracts(stats) {
    try {
      const auditedContractsFile = path.join(this.dataDir, 'audited-contracts.json');
      
      if (!fs.existsSync(auditedContractsFile)) {
        return; // No audited contracts file yet
      }
      
      const data = fs.readFileSync(auditedContractsFile, 'utf8');
      const auditedData = JSON.parse(data);
      
      // Count audits from audited-contracts.json
      let auditedCount = 0;
      let withVuln = 0;
      let withoutVuln = 0;
      let failedCount = 0;
      
      if (Array.isArray(auditedData)) {
        // Old array format
        auditedCount = auditedData.length;
      } else if (typeof auditedData === 'object') {
        // New object format
        auditedCount = Object.keys(auditedData).length;
        
        for (const contractData of Object.values(auditedData)) {
          if (contractData.failed === true) {
            failedCount++;
          } else if (contractData.hasVulnerabilities === true) {
            withVuln++;
          } else if (contractData.hasVulnerabilities === false) {
            withoutVuln++;
          }
        }
      }
      
      // Update stats with actual counts from audited-contracts.json
      stats.totalAudited = auditedCount;
      stats.withVulnerabilities = withVuln;
      stats.withoutVulnerabilities = withoutVuln;
      stats.failed = failedCount;
      
      // Save updated stats
      this.stats = stats;
      this.saveStats();
      
    } catch (error) {
      // Silently fail - don't break if file doesn't exist or is malformed
      console.error('Error rebuilding statistics from audited contracts:', error.message);
    }
  }

  /**
   * Save statistics to file
   */
  saveStats() {
    try {
      this.stats.lastUpdated = new Date().toISOString();
      fs.writeFileSync(
        this.statsFile,
        JSON.stringify(this.stats, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('Error saving statistics:', error.message);
    }
  }

  /**
   * Increment total fetched contracts count
   */
  incrementFetched() {
    this.stats.totalFetched++;
    this.saveStats();
  }

  /**
   * Record an audit result
   * @param {boolean} hasVulnerabilities - Whether vulnerabilities were found
   */
  recordAudit(hasVulnerabilities) {
    this.stats.totalAudited++;
    
    if (hasVulnerabilities) {
      this.stats.withVulnerabilities++;
    } else {
      this.stats.withoutVulnerabilities++;
    }
    
    this.saveStats();
  }

  /**
   * Record an audit failure
   */
  recordAuditFailure() {
    this.stats.totalAudited++;
    this.stats.failed = (this.stats.failed || 0) + 1;
    this.saveStats();
  }

  /**
   * Get current statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const successfulAudits = this.stats.totalAudited - (this.stats.failed || 0);
    return {
      ...this.stats,
      failed: this.stats.failed || 0,
      // Calculate percentages
      vulnerabilityRate: successfulAudits > 0
        ? ((this.stats.withVulnerabilities / successfulAudits) * 100).toFixed(2) + '%'
        : '0%',
      cleanRate: successfulAudits > 0
        ? ((this.stats.withoutVulnerabilities / successfulAudits) * 100).toFixed(2) + '%'
        : '0%',
      failureRate: this.stats.totalAudited > 0
        ? (((this.stats.failed || 0) / this.stats.totalAudited) * 100).toFixed(2) + '%'
        : '0%',
      pendingAudit: this.stats.totalFetched - this.stats.totalAudited
    };
  }

  /**
   * Display statistics in a formatted way
   */
  displayStats() {
    const stats = this.getStats();
    
    const failedInfo = stats.failed > 0 ? ` | Failed=${stats.failed}` : '';
    console.log(`\n📊 Stats: Fetched=${stats.totalFetched} | Audited=${stats.totalAudited} | Pending=${stats.pendingAudit} | Vuln=${stats.withVulnerabilities} (${stats.vulnerabilityRate}) | Clean=${stats.withoutVulnerabilities} (${stats.cleanRate})${failedInfo}`);
  }

  /**
   * Add a history entry (for tracking over time)
   * @param {Object} entry - History entry
   */
  addHistoryEntry(entry) {
    if (!this.stats.history) {
      this.stats.history = [];
    }
    
    this.stats.history.push({
      timestamp: new Date().toISOString(),
      ...entry
    });
    
    // Keep only last 100 entries
    if (this.stats.history.length > 100) {
      this.stats.history = this.stats.history.slice(-100);
    }
    
    this.saveStats();
  }

  /**
   * Reset statistics (use with caution)
   */
  reset() {
    this.stats = {
      totalFetched: 0,
      totalAudited: 0,
      withVulnerabilities: 0,
      withoutVulnerabilities: 0,
      failed: 0,
      lastUpdated: new Date().toISOString(),
      history: []
    };
    this.saveStats();
  }
}
