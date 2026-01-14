/**
 * Background auditor module
 * Continuously audits contracts in parallel with the main event listener
 */

import fs from 'fs';
import path from 'path';
import { AuditorPool } from './auditorPool.js';
import { AuditStatistics } from '../storage/auditStatistics.js';
import { getOpenAIKeys, getTelegramConfig } from '../config/apiKeys.js';

export class BackgroundAuditor {
  constructor(dataDir = './data', statistics = null) {
    this.dataDir = dataDir;
    this.sourcesDir = path.join(dataDir, 'sources');
    this.statistics = statistics || new AuditStatistics(dataDir);
    
    // Initialize auditor pool with multiple API keys for parallel auditing
    const apiKeys = getOpenAIKeys();
    const telegramConfig = getTelegramConfig();
    this.auditorPool = new AuditorPool(apiKeys, telegramConfig);
    
    this.isRunning = false;
    this.checkInterval = 5000; // Check every 5 seconds (faster with parallel processing)
    this.auditDelay = 2000; // Reduced delay with parallel auditors
    this.currentlyAuditing = [];
    this.rateLimitWaitTime = 60000; // Wait 60s when rate limited
    this.maxConcurrentAudits = apiKeys.length; // Audit as many as we have auditors
  }

  /**
   * Start the background auditor
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️  Background auditor already running');
      return;
    }

    this.isRunning = true;
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║           Background Auditor Started (Parallel Mode)          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log(`✅ Checking for unaudited contracts every ${this.checkInterval / 1000}s`);
    console.log(`⏱️  Delay between audits: ${this.auditDelay / 1000}s\n`);

    // Start the continuous audit loop
    this.auditLoop();
  }

  /**
   * Stop the background auditor
   */
  stop() {
    this.isRunning = false;
    console.log('\n🛑 Background auditor stopped');
  }

  /**
   * Continuous loop that checks for and audits contracts
   */
  async auditLoop() {
    while (this.isRunning) {
      try {
        await this.checkAndAuditContracts();
      } catch (error) {
        console.error('❌ Error in audit loop:', error.message);
      }

      // Wait before next check
      await this.sleep(this.checkInterval);
    }
  }

  /**
   * Check for unaudited contracts and audit them in parallel
   */
  async checkAndAuditContracts() {
    // Get list of all source files
    if (!fs.existsSync(this.sourcesDir)) {
      return;
    }

    const sourceFiles = fs.readdirSync(this.sourcesDir)
      .filter(f => f.endsWith('.sol'))
      .map(file => {
        // Extract index number from filename (format: index_address.sol)
        const match = file.match(/^(\d+)_/);
        const index = match ? parseInt(match[1], 10) : Infinity;
        return { file, index };
      })
      .filter(item => !isNaN(item.index) && item.index !== Infinity)
      .sort((a, b) => a.index - b.index) // Sort by index number (ascending)
      .map(item => item.file); // Extract just the filename

    if (sourceFiles.length === 0) {
      return;
    }

    // Find unaudited contracts
    const unauditedFiles = [];
    for (const file of sourceFiles) {
      // Extract contract address from filename (format: index_address.sol)
      const match = file.match(/_([0-9a-fx]+)\.sol$/i);
      if (!match) continue;

      const contractAddress = match[1];
      
      // Check if already audited or currently auditing
      if (this.auditorPool.isAudited(contractAddress) || this.currentlyAuditing.includes(contractAddress)) {
        continue;
      }

      unauditedFiles.push({ file, contractAddress });
    }

    if (unauditedFiles.length === 0) {
      return;
    }

    // Process multiple contracts in parallel
    const auditPromises = [];
    const contractsToAudit = unauditedFiles.slice(0, this.maxConcurrentAudits - this.currentlyAuditing.length);

    for (const { file, contractAddress } of contractsToAudit) {
      if (!this.isRunning) break;

      const sourceFilePath = path.join(this.sourcesDir, file);
      
      // Start auditing in parallel (don't await)
      const promise = this.auditContract(contractAddress, sourceFilePath)
        .catch(error => {
          console.error(`❌ Audit error for ${contractAddress}:`, error.message);
        });
      
      auditPromises.push(promise);
      
      // Small delay to stagger the starts
      await this.sleep(500);
    }

    // Wait for all audits to complete
    if (auditPromises.length > 0) {
      await Promise.allSettled(auditPromises);
    }
  }

  /**
   * Audit a single contract using parallel auditor pool
   * @param {string} contractAddress - Contract address
   * @param {string} sourceFilePath - Path to source file
   */
  async auditContract(contractAddress, sourceFilePath) {
    // Add to currently auditing list
    this.currentlyAuditing.push(contractAddress);

    try {
      const result = await this.auditorPool.auditContract(contractAddress, sourceFilePath);

      if (result.skipped) {
        return; // Skip silently
      } else if (result.error) {
        console.log(`   ❌ Audit failed: ${result.error}`);
      } else {
        if (result.hasVulnerabilities) {
          console.log(`   🚨 VULN: ${contractAddress} | ${result.criticalIssuesCount} issue(s): ${result.vulnerabilityNames.join(', ')} | Surface: ${result.attackSurface.join(', ')}`);
        } else {
          console.log(`   ✅ Clean: ${contractAddress}`);
        }
      }
    } catch (error) {
      console.error(`   ❌ Error: ${contractAddress} - ${error.message}`);
      
      // If rate limited, wait longer (less common with parallel processing)
      if (error.message.includes('Rate limit') || error.message.includes('429')) {
        console.log(`   ⏸️  Rate limited - waiting ${this.rateLimitWaitTime / 1000}s...`);
        await this.sleep(this.rateLimitWaitTime);
      }
    } finally {
      // Remove from currently auditing list
      const index = this.currentlyAuditing.indexOf(contractAddress);
      if (index > -1) {
        this.currentlyAuditing.splice(index, 1);
      }
    }
  }

  /**
   * Get statistics about the audit queue
   * @returns {Object} Statistics
   */
  getStats() {
    if (!fs.existsSync(this.sourcesDir)) {
      return {
        totalSourceFiles: 0,
        unauditedCount: 0,
        nextToAudit: null,
        currentlyAuditing: this.currentlyAuditing,
        isRunning: this.isRunning
      };
    }

    const sourceFiles = fs.readdirSync(this.sourcesDir)
      .filter(f => f.endsWith('.sol'))
      .map(file => {
        const match = file.match(/^(\d+)_([0-9a-fx]+)\.sol$/i);
        if (!match) return null;
        return {
          file,
          index: parseInt(match[1], 10),
          address: match[2]
        };
      })
      .filter(item => item !== null)
      .sort((a, b) => a.index - b.index);

    const unaudited = sourceFiles.filter(item => {
      return !this.auditorPool.isAudited(item.address);
    });

    const nextToAudit = unaudited.length > 0 ? {
      index: unaudited[0].index,
      address: unaudited[0].address
    } : null;

    return {
      totalSourceFiles: sourceFiles.length,
      unauditedCount: unaudited.length,
      nextToAudit: nextToAudit ? `#${nextToAudit.index} (${nextToAudit.address})` : null,
      currentlyAuditing: this.currentlyAuditing,
      isRunning: this.isRunning
    };
  }

  /**
   * Sleep helper
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
