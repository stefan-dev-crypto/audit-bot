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
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading statistics:', error.message);
    }

    // Default statistics
    return {
      totalFetched: 0,
      totalAudited: 0,
      withVulnerabilities: 0,
      withoutVulnerabilities: 0,
      lastUpdated: new Date().toISOString(),
      history: []
    };
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
   * Get current statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      // Calculate percentages
      vulnerabilityRate: this.stats.totalAudited > 0
        ? ((this.stats.withVulnerabilities / this.stats.totalAudited) * 100).toFixed(2) + '%'
        : '0%',
      cleanRate: this.stats.totalAudited > 0
        ? ((this.stats.withoutVulnerabilities / this.stats.totalAudited) * 100).toFixed(2) + '%'
        : '0%',
      pendingAudit: this.stats.totalFetched - this.stats.totalAudited
    };
  }

  /**
   * Display statistics in a formatted way
   */
  displayStats() {
    const stats = this.getStats();
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 AUDIT STATISTICS');
    console.log('='.repeat(80));
    console.log(`Total Contracts Fetched:     ${stats.totalFetched}`);
    console.log(`Total Contracts Audited:      ${stats.totalAudited}`);
    console.log(`Pending Audit:                ${stats.pendingAudit}`);
    console.log('');
    console.log(`With Critical Vulnerabilities: ${stats.withVulnerabilities} (${stats.vulnerabilityRate})`);
    console.log(`Without Vulnerabilities:       ${stats.withoutVulnerabilities} (${stats.cleanRate})`);
    console.log('');
    console.log(`Last Updated: ${stats.lastUpdated}`);
    console.log('='.repeat(80) + '\n');
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
      lastUpdated: new Date().toISOString(),
      history: []
    };
    this.saveStats();
  }
}
