/**
 * Auditor Pool
 * Manages multiple OpenAI auditors for parallel contract auditing
 */

import { OpenAIAuditor } from './openaiAuditor.js';

export class AuditorPool {
  constructor(apiKeys, telegramConfig = null) {
    if (!apiKeys || apiKeys.length === 0) {
      throw new Error('At least one OpenAI API key is required');
    }

    // Create an auditor instance for each API key
    this.auditors = apiKeys.map((key, index) => ({
      id: index,
      key: key.substring(0, 15) + '...',
      auditor: new OpenAIAuditor(key, telegramConfig),
      isAvailable: true,
      lastUsed: 0,
      totalAudits: 0,
    }));

    this.minDelayBetweenAudits = 1000; // 1 second per auditor
    
    // Track contracts currently being audited to prevent duplicates
    this.auditingContracts = new Set();
    
    console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
    console.log(`║              Auditor Pool Initialized                         ║`);
    console.log(`╚════════════════════════════════════════════════════════════════╝`);
    console.log(`✅ ${this.auditors.length} auditor(s) ready for parallel processing`);
    console.log(`⏱️  Rate limit per auditor: ${this.minDelayBetweenAudits / 1000}s\n`);
  }

  /**
   * Get an available auditor (round-robin with rate limiting)
   * @returns {Promise<Object>} Auditor wrapper object
   */
  async getAvailableAuditor() {
    while (true) {
      const now = Date.now();
      
      // Find auditors that are available and past their rate limit
      const availableAuditors = this.auditors.filter(a => {
        const timeSinceLastUse = now - a.lastUsed;
        return a.isAvailable && timeSinceLastUse >= this.minDelayBetweenAudits;
      });

      if (availableAuditors.length > 0) {
        // Return the least recently used auditor
        const auditor = availableAuditors.reduce((least, current) => 
          current.lastUsed < least.lastUsed ? current : least
        );
        
        auditor.isAvailable = false;
        auditor.lastUsed = now;
        return auditor;
      }

      // If no auditors available, wait a bit and try again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Release an auditor back to the pool
   * @param {number} auditorId - ID of the auditor to release
   */
  releaseAuditor(auditorId) {
    const auditor = this.auditors.find(a => a.id === auditorId);
    if (auditor) {
      auditor.isAvailable = true;
      auditor.totalAudits++;
    }
  }

  /**
   * Audit a contract using an available auditor from the pool
   * Prevents duplicate audits with a lock mechanism
   * @param {string} contractAddress - Contract address
   * @param {string} sourceFilePath - Path to contract source file
   * @returns {Promise<Object>} Audit result
   */
  async auditContract(contractAddress, sourceFilePath) {
    const normalizedAddress = contractAddress.toLowerCase();
    
    // Check if already audited (with file check for persistence)
    if (this.isAudited(contractAddress)) {
      return { skipped: true, address: contractAddress };
    }
    
    // Check if currently being audited by another auditor (prevent duplicates)
    if (this.auditingContracts.has(normalizedAddress)) {
      return { skipped: true, address: contractAddress, reason: 'Already being audited' };
    }
    
    // Acquire lock
    this.auditingContracts.add(normalizedAddress);
    
    const auditorWrapper = await this.getAvailableAuditor();
    
    try {
      // Double-check after acquiring auditor (file might have been updated)
      if (this.isAudited(contractAddress)) {
        return { skipped: true, address: contractAddress };
      }
      
      const result = await auditorWrapper.auditor.auditContract(contractAddress, sourceFilePath);
      return result;
    } finally {
      // Release lock
      this.auditingContracts.delete(normalizedAddress);
      this.releaseAuditor(auditorWrapper.id);
    }
  }

  /**
   * Check if a contract has been audited
   * Checks the file directly to ensure persistence across restarts
   * @param {string} address - Contract address
   * @returns {boolean}
   */
  isAudited(address) {
    // All auditors share the same audited contracts state
    // The isAudited() method checks the file if not in memory Set,
    // ensuring contracts audited before restart are not re-audited
    return this.auditors[0].auditor.isAudited(address);
  }
  
  /**
   * Reload audited contracts in all auditors (useful after external updates)
   */
  reloadAuditedContracts() {
    this.auditors.forEach(auditorWrapper => {
      auditorWrapper.auditor.loadAuditedContracts();
    });
  }

  /**
   * Get pool statistics
   * @returns {Object}
   */
  getStats() {
    const totalAudits = this.auditors.reduce((sum, a) => sum + a.totalAudits, 0);
    const availableCount = this.auditors.filter(a => a.isAvailable).length;
    
    return {
      totalAuditors: this.auditors.length,
      availableAuditors: availableCount,
      busyAuditors: this.auditors.length - availableCount,
      totalAuditsCompleted: totalAudits,
      auditorStats: this.auditors.map(a => ({
        id: a.id,
        key: a.key,
        available: a.isAvailable,
        totalAudits: a.totalAudits,
      })),
    };
  }

  /**
   * Display pool statistics
   */
  displayStats() {
    const stats = this.getStats();
    console.log(`\n📊 Auditor Pool Stats:`);
    console.log(`   Total Auditors: ${stats.totalAuditors}`);
    console.log(`   Available: ${stats.availableAuditors} | Busy: ${stats.busyAuditors}`);
    console.log(`   Total Audits: ${stats.totalAuditsCompleted}`);
    
    if (stats.auditorStats.length <= 5) {
      console.log(`\n   Per-Auditor Breakdown:`);
      stats.auditorStats.forEach(a => {
        const status = a.available ? '✅' : '⏳';
        console.log(`   ${status} Auditor ${a.id} (${a.key}): ${a.totalAudits} audits`);
      });
    }
  }
}
