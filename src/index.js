/**
 * Audit Bot - Main Entry Point
 * Detects ERC20 approval events and audits contracts in parallel
 */

import 'dotenv/config';
import { getChainConfig, getAvailableChains } from './config/chains.js';
import { ApprovalListener } from './events/approvalListener.js';
import { BackgroundFetcher } from './fetcher/backgroundFetcher.js';
import { BackgroundAuditor } from './audit/backgroundAuditor.js';
import { BackgroundProcessor } from './processor/backgroundProcessor.js';
import { AuditStatistics } from './storage/auditStatistics.js';
import { isCombinedMode, SETTINGS } from './config/settings.js';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                        AUDIT BOT v2.0                          ║');
  console.log('║         ERC20 Approval Monitor & Parallel AI Auditor           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  // Get the chain to monitor (default: ethereum)
  const chainName = process.env.CHAIN || 'ethereum';
  
  try {
    // Get chain configuration
    const chainConfig = getChainConfig(chainName);
    
    console.log(`Chain: ${chainConfig.name}`);
    console.log(`Chain ID: ${chainConfig.chainId}`);
    console.log(`Available chains: ${getAvailableChains().join(', ')}\n`);
    
    // Initialize statistics tracker
    const statistics = new AuditStatistics();
    
    // Choose processing mode based on configuration
    let backgroundFetcher, backgroundAuditor, backgroundProcessor;
    
    if (isCombinedMode()) {
      // Combined mode: Fetch and audit together (saves disk space)
      console.log(`Mode: Combined (Fetch + Audit)`);
      backgroundProcessor = new BackgroundProcessor('./data', chainConfig, statistics);
      backgroundProcessor.start();
    } else {
      // Separate mode: Fetch to files, then audit separately
      console.log(`Mode: Separate (Fetch → Audit)`);
      backgroundFetcher = new BackgroundFetcher('./data', chainConfig);
      backgroundFetcher.start();
      
      backgroundAuditor = new BackgroundAuditor('./data', statistics);
      backgroundAuditor.start();
    }
    
    // Create and start the approval listener
    const listener = new ApprovalListener(chainConfig, statistics);
    
    // Display audit queue stats periodically (only in separate mode)
    const queueStatsInterval = !isCombinedMode() ? setInterval(() => {
      if (backgroundAuditor) {
        const stats = backgroundAuditor.getStats();
        if (stats.unauditedCount > 0 || stats.currentlyAuditing) {
          const nextInfo = stats.nextToAudit ? ` | Next: ${stats.nextToAudit}` : '';
          console.log(`📊 Queue: ${stats.unauditedCount} unaudited${nextInfo} | Auditing: ${stats.currentlyAuditing || 'None'}`);
        }
      }
    }, 60000) : null; // Every 60 seconds
    
    // Display audit statistics periodically
    const statisticsInterval = setInterval(() => {
      statistics.displayStats();
    }, 300000); // Every 5 minutes
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      if (queueStatsInterval) clearInterval(queueStatsInterval);
      clearInterval(statisticsInterval);
      console.log('\n\n📊 Final Statistics:');
      const listenerStats = listener.getStats();
      if (isCombinedMode()) {
        console.log(`Detected: ${listenerStats.totalProcessed}`);
      } else {
        const fetcherStats = backgroundFetcher.getStats();
        const auditorStats = backgroundAuditor.getStats();
        console.log(`Detected: ${listenerStats.totalProcessed} | Fetched: ${fetcherStats.totalFetched} | Unaudited: ${auditorStats.unauditedCount}`);
      }
      statistics.displayStats();
      console.log('\n👋 Shutting down...');
      if (backgroundProcessor) backgroundProcessor.stop();
      if (backgroundFetcher) backgroundFetcher.stop();
      if (backgroundAuditor) backgroundAuditor.stop();
      listener.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      if (queueStatsInterval) clearInterval(queueStatsInterval);
      clearInterval(statisticsInterval);
      statistics.displayStats();
      if (backgroundProcessor) backgroundProcessor.stop();
      if (backgroundFetcher) backgroundFetcher.stop();
      if (backgroundAuditor) backgroundAuditor.stop();
      listener.stop();
      process.exit(0);
    });
    
    // Start listening
    await listener.start();
    
  } catch (error) {
    console.error('❌ Error starting audit bot:', error.message);
    process.exit(1);
  }
}

main();
