/**
 * Audit Bot - Main Entry Point
 * Detects ERC20 approval events and audits contracts in parallel
 */

import 'dotenv/config';
import { getChainConfig, getAvailableChains } from './config/chains.js';
import { ApprovalListener } from './events/approvalListener.js';
import { BackgroundAuditor } from './audit/backgroundAuditor.js';
import { AuditStatistics } from './storage/auditStatistics.js';

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
    
    // Create and start the background auditor (runs in parallel)
    const backgroundAuditor = new BackgroundAuditor('./data', statistics);
    backgroundAuditor.start();
    
    // Create and start the approval listener
    const listener = new ApprovalListener(chainConfig, statistics);
    
    // Display audit queue stats periodically
    const queueStatsInterval = setInterval(() => {
      const stats = backgroundAuditor.getStats();
      if (stats.unauditedCount > 0 || stats.currentlyAuditing) {
        const nextInfo = stats.nextToAudit ? ` | Next: ${stats.nextToAudit}` : '';
        console.log(`\n📊 [Audit Queue] Unaudited: ${stats.unauditedCount}${nextInfo} | Currently auditing: ${stats.currentlyAuditing || 'None'}`);
      }
    }, 60000); // Every 60 seconds
    
    // Display audit statistics periodically
    const statisticsInterval = setInterval(() => {
      statistics.displayStats();
    }, 300000); // Every 5 minutes
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      clearInterval(queueStatsInterval);
      clearInterval(statisticsInterval);
      console.log('\n\n📊 Final Statistics:');
      const listenerStats = listener.getStats();
      const auditorStats = backgroundAuditor.getStats();
      console.log(`Total contracts processed: ${listenerStats.totalProcessed}`);
      console.log(`Unaudited contracts: ${auditorStats.unauditedCount}`);
      console.log('');
      statistics.displayStats();
      console.log('\n👋 Shutting down gracefully...');
      backgroundAuditor.stop();
      listener.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      clearInterval(queueStatsInterval);
      clearInterval(statisticsInterval);
      statistics.displayStats();
      backgroundAuditor.stop();
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
