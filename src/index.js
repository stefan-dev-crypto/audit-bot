#!/usr/bin/env node

const ERC20ApprovalMonitor = require('./monitors/erc20ApprovalMonitor');
const logger = require('./utils/logger');
const config = require('./config');

/**
 * Main entry point for audit-bot
 * ERC20 Approval Event Monitor
 */
async function main() {
  try {
    logger.info('Starting audit-bot - ERC20 Approval Event Monitor...');
    
    // Create monitor instance
    const monitor = new ERC20ApprovalMonitor({
      rpcUrl: config.ethereum.rpcUrl,
    });
    
    // Initialize monitor
    await monitor.initialize();
    
    // Example: Monitor specific tokens from config
    const tokens = config.erc20Monitoring.tokens || {};
    const tokenAddresses = Object.values(tokens);
    const tokenSymbols = Object.keys(tokens);
    
    if (tokenAddresses.length > 0) {
      logger.info(`Monitoring ${tokenAddresses.length} configured tokens: ${tokenSymbols.join(', ')}`);
      
      // Create a map for quick symbol lookup
      const addressToSymbol = {};
      tokenSymbols.forEach(symbol => {
        addressToSymbol[tokens[symbol].toLowerCase()] = symbol;
      });
      
      monitor.monitorTokens(tokenAddresses, (eventData) => {
        const symbol = addressToSymbol[eventData.tokenAddress.toLowerCase()] || 'UNKNOWN';
        
        // Get address type labels
        const ownerLabel = eventData.ownerIsContract !== null 
          ? (eventData.ownerIsContract ? 'Contract' : 'Wallet')
          : 'Unknown';
        const spenderLabel = eventData.spenderIsContract !== null
          ? (eventData.spenderIsContract ? 'Contract' : 'Wallet')
          : 'Unknown';
        
        console.log('\n📝 Approval Event Detected:');
        console.log(`  Token: ${symbol} (${eventData.tokenAddress})`);
        console.log(`  Owner (Sender): ${eventData.owner} [${ownerLabel}]`);
        console.log(`  Spender (Recipient): ${eventData.spender} [${spenderLabel}]`);
        console.log(`  Amount: ${eventData.amount}`);
        console.log(`  Block: ${eventData.blockNumber}`);
        console.log(`  Tx Hash: ${eventData.transactionHash}`);
        console.log('---\n');
      });
    }
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      logger.info('\nReceived SIGINT, shutting down gracefully...');
      monitor.stopAll();
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      logger.info('\nReceived SIGTERM, shutting down gracefully...');
      monitor.stopAll();
      process.exit(0);
    });
    
    logger.info('Monitor is running. Press Ctrl+C to stop.');
    
  } catch (error) {
    logger.error('Failed to start monitor:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { ERC20ApprovalMonitor };
