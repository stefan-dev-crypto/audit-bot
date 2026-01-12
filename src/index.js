#!/usr/bin/env node

const ERC20ApprovalMonitor = require('./monitors/erc20ApprovalMonitor');
const logger = require('./utils/logger');
const config = require('./config');
const addressChecker = require('./utils/addressChecker');
const etherscan = require('./utils/etherscan');
const auditIntegration = require('./utils/auditIntegration');

/**
 * Main entry point for audit-bot
 * ERC20 Approval Event Monitor
 */
async function main() {
  try {
    logger.info('Starting audit-bot - ERC20 Approval Event Monitor...');
    
    // Initialize address checker and Etherscan
    await addressChecker.initializeCache();
    await etherscan.initialize();
    
    // Log Etherscan configuration
    if (config.etherscan.apiKey) {
      logger.info(`Etherscan API configured for ${config.etherscan.network}`);
      if (config.etherscan.fetchSourceCode) {
        logger.info('Auto-fetching contract source codes enabled');
      }
    } else {
      logger.info('Etherscan API key not configured (source code fetching disabled)');
    }

    // Initialize audit system if enabled
    if (config.audit.enabled) {
      await auditIntegration.initializeAuditManager();
      logger.info('Audit system initialized');
    }
    
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
      
      monitor.monitorTokens(tokenAddresses, async (eventData) => {
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
        
        // Optionally fetch and display source code info for contract addresses
        if (config.etherscan.fetchSourceCode && config.etherscan.apiKey) {
          // Fetch source code for contract addresses (non-blocking, checks if already fetched)
          const contractAddresses = [];
          if (eventData.ownerIsContract) contractAddresses.push(eventData.owner);
          if (eventData.spenderIsContract) contractAddresses.push(eventData.spender);
          
          for (const contractAddr of contractAddresses) {
            try {
              const sourceCode = await addressChecker.fetchContractSourceCode(contractAddr);
              if (sourceCode) {
                const label = contractAddr === eventData.owner ? 'Owner' : 'Spender';
                console.log(`  ${label} Contract: Source code ${sourceCode.length > 0 ? 'fetched' : 'not available'}`);
              }
            } catch (err) {
              // Silently ignore - optional feature
            }
          }
        }
        
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
