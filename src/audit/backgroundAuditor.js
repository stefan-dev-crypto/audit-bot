/**
 * Background auditor module
 * Continuously audits contracts in parallel with the main event listener
 */

import fs from 'fs';
import path from 'path';
import { OpenAIAuditor } from './openaiAuditor.js';
import { AuditStatistics } from '../storage/auditStatistics.js';

export class BackgroundAuditor {
  constructor(dataDir = './data', statistics = null) {
    this.dataDir = dataDir;
    this.sourcesDir = path.join(dataDir, 'sources');
    this.statistics = statistics || new AuditStatistics(dataDir);
    this.auditor = new OpenAIAuditor(process.env.OPENAI_API_KEY, this.statistics);
    this.isRunning = false;
    this.checkInterval = 10000; // Check every 10 seconds
    this.auditDelay = 2000; // Delay between audits (rate limiting)
    this.currentlyAuditing = null;
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
   * Check for unaudited contracts and audit them in order by index number
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

    // Check each source file in order
    for (const file of sourceFiles) {
      if (!this.isRunning) break;

      // Extract contract address from filename (format: index_address.sol)
      const match = file.match(/_([0-9a-fx]+)\.sol$/i);
      if (!match) continue;

      const contractAddress = match[1];
      
      // Check if already audited
      if (this.auditor.isAudited(contractAddress)) {
        continue;
      }

      // Check if currently auditing this contract
      if (this.currentlyAuditing === contractAddress) {
        continue;
      }

      // Found an unaudited contract - audit it
      const sourceFilePath = path.join(this.sourcesDir, file);
      console.log(`   📋 Processing contract #${file.match(/^(\d+)_/)[1]}: ${contractAddress}`);
      await this.auditContract(contractAddress, sourceFilePath);

      // Rate limiting delay
      await this.sleep(this.auditDelay);
    }
  }

  /**
   * Audit a single contract
   * @param {string} contractAddress - Contract address
   * @param {string} sourceFilePath - Path to source file
   */
  async auditContract(contractAddress, sourceFilePath) {
    this.currentlyAuditing = contractAddress;

    try {
      console.log(`\n🔍 [Background Auditor] Auditing: ${contractAddress}`);
      
      const result = await this.auditor.auditContract(contractAddress, sourceFilePath);

      if (result.skipped) {
        console.log(`   ⏭️  Skipped (already audited)`);
      } else if (result.error) {
        console.log(`   ❌ Audit failed: ${result.error}`);
      } else {
        if (result.hasVulnerabilities) {
          console.log(`   🚨 CRITICAL VULNERABILITIES FOUND!`);
          console.log(`   📊 Attack Surface: ${result.attackSurface.join(', ')}`);
          console.log(`   🔴 Issues: ${result.criticalIssuesCount}`);
          console.log(`   📝 Types: ${result.vulnerabilityNames.join(', ')}`);
        } else {
          console.log(`   ✅ Clean (no critical vulnerabilities)`);
        }
      }
    } catch (error) {
      console.error(`   ❌ Error auditing ${contractAddress}:`, error.message);
      
      // If rate limited, wait longer
      if (error.message.includes('Rate limited')) {
        console.log('   ⏸️  Rate limited - waiting 60 seconds...');
        await this.sleep(60000);
      }
    } finally {
      this.currentlyAuditing = null;
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
      return !this.auditor.isAudited(item.address);
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
