#!/usr/bin/env node

const ERC20ApprovalMonitor = require('./monitors/erc20ApprovalMonitor');
const logger = require('./utils/logger');
const consoleOutput = require('./utils/consoleOutput');
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
    // Initialize components
    const components = [];
    
    // Address checker
    await addressChecker.initializeCache();
    components.push({ name: 'Address Checker', enabled: true });
    
    // Etherscan
    await etherscan.initialize();
    if (config.etherscan.apiKey) {
      components.push({
        name: 'Etherscan API',
        enabled: true,
        details: [`Network: ${config.etherscan.network}`, config.etherscan.fetchSourceCode ? 'Source code fetching: enabled' : 'Source code fetching: disabled']
      });
    } else {
      components.push({ name: 'Etherscan API', enabled: false });
    }
    
    // Audit system
    if (config.audit.enabled) {
      await auditIntegration.initializeAuditManager();
      const auditStatus = await auditIntegration.getAuditorsStatus();
      const enabledAuditors = Object.entries(auditStatus)
        .filter(([_, status]) => status.available)
        .map(([name]) => name);
      
      components.push({
        name: 'Audit System',
        enabled: true,
        details: [`Auditors: ${enabledAuditors.join(', ') || 'none'}`]
      });
    } else {
      components.push({ name: 'Audit System', enabled: false });
    }
    
    consoleOutput.systemInit(components);
    
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
      consoleOutput.info(`Monitoring ${tokenAddresses.length} token(s): ${tokenSymbols.join(', ')}`);
      
      // Create a map for quick symbol lookup
      const addressToSymbol = {};
      tokenSymbols.forEach(symbol => {
        addressToSymbol[tokens[symbol].toLowerCase()] = symbol;
      });
      
      monitor.monitorTokens(tokenAddresses, async (eventData) => {
        const symbol = addressToSymbol[eventData.tokenAddress.toLowerCase()] || 'UNKNOWN';
        consoleOutput.approvalEvent(eventData, symbol);
      });
    }
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      consoleOutput.blank();
      consoleOutput.warn('Shutting down gracefully...');
      monitor.stopAll();
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      consoleOutput.blank();
      consoleOutput.warn('Shutting down gracefully...');
      monitor.stopAll();
      process.exit(0);
    });
    
    consoleOutput.monitoringStatus(tokenAddresses.length);
    
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
