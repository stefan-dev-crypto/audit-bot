#!/usr/bin/env node

/**
 * ERC20 Approval Monitor Example
 * 
 * This file demonstrates various ways to use the ERC20ApprovalMonitor
 * to detect and monitor ERC20 token Approval events on Ethereum.
 */

const ERC20ApprovalMonitor = require('../monitors/erc20ApprovalMonitor');
const logger = require('../utils/logger');
const config = require('../config');

// Example token addresses (mainnet)
const EXAMPLE_TOKENS = {
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
};

/**
 * Example 1: Monitor a single token
 */
async function example1_MonitorSingleToken() {
  console.log('\n=== Example 1: Monitor Single Token ===\n');
  
  const monitor = new ERC20ApprovalMonitor({
    rpcUrl: config.ethereum.rpcUrl,
  });
  
  await monitor.initialize();
  
  // Monitor USDC Approval events
  monitor.monitorToken(EXAMPLE_TOKENS.USDC, (eventData) => {
    console.log('📝 Approval Event Detected:');
    console.log(`  Token: ${eventData.tokenAddress}`);
    console.log(`  Owner (Sender): ${eventData.owner}`);
    console.log(`  Spender (Recipient): ${eventData.spender}`);
    console.log(`  Amount: ${eventData.amount}`);
    console.log(`  Block: ${eventData.blockNumber}`);
    console.log(`  Tx Hash: ${eventData.transactionHash}`);
    console.log('---');
  });
  
  console.log(`Monitoring USDC (${EXAMPLE_TOKENS.USDC}) for Approval events...`);
  console.log('Press Ctrl+C to stop\n');
  
  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\nStopping monitor...');
    monitor.stopAll();
    process.exit(0);
  });
}

/**
 * Example 2: Monitor multiple tokens
 */
async function example2_MonitorMultipleTokens() {
  console.log('\n=== Example 2: Monitor Multiple Tokens ===\n');
  
  const monitor = new ERC20ApprovalMonitor({
    rpcUrl: config.ethereum.rpcUrl,
  });
  
  await monitor.initialize();
  
  const tokensToMonitor = [
    EXAMPLE_TOKENS.USDC,
    EXAMPLE_TOKENS.USDT,
    EXAMPLE_TOKENS.DAI,
  ];
  
  // Monitor multiple tokens with a single callback
  monitor.monitorTokens(tokensToMonitor, (eventData) => {
    const tokenName = Object.keys(EXAMPLE_TOKENS).find(
      key => EXAMPLE_TOKENS[key].toLowerCase() === eventData.tokenAddress.toLowerCase()
    ) || 'UNKNOWN';
    
    console.log(`📝 [${tokenName}] Approval Event:`);
    console.log(`  Owner: ${eventData.owner}`);
    console.log(`  Spender: ${eventData.spender}`);
    console.log(`  Amount: ${eventData.amount}`);
    console.log(`  Block: ${eventData.blockNumber}`);
    console.log('---');
  });
  
  console.log(`Monitoring ${tokensToMonitor.length} tokens for Approval events...`);
  console.log('Press Ctrl+C to stop\n');
  
  process.on('SIGINT', () => {
    console.log('\nStopping monitor...');
    monitor.stopAll();
    process.exit(0);
  });
}

/**
 * Example 3: Monitor all ERC20 Approval events
 */
async function example3_MonitorAllApprovals() {
  console.log('\n=== Example 3: Monitor All ERC20 Approval Events ===\n');
  
  const monitor = new ERC20ApprovalMonitor({
    rpcUrl: config.ethereum.rpcUrl,
  });
  
  await monitor.initialize();
  
  // Monitor all ERC20 Approval events on the network
  monitor.monitorAllApprovals((eventData) => {
    console.log('📝 Approval Event (All Tokens):');
    console.log(`  Token: ${eventData.tokenAddress}`);
    console.log(`  Owner: ${eventData.owner}`);
    console.log(`  Spender: ${eventData.spender}`);
    console.log(`  Amount: ${eventData.amount}`);
    console.log(`  Block: ${eventData.blockNumber}`);
    console.log('---');
  });
  
  console.log('Monitoring all ERC20 Approval events on Ethereum...');
  console.log('Press Ctrl+C to stop\n');
  
  process.on('SIGINT', () => {
    console.log('\nStopping monitor...');
    monitor.stopAll();
    process.exit(0);
  });
}

/**
 * Example 4: Query historical Approval events
 */
async function example4_QueryHistoricalEvents() {
  console.log('\n=== Example 4: Query Historical Approval Events ===\n');
  
  const monitor = new ERC20ApprovalMonitor({
    rpcUrl: config.ethereum.rpcUrl,
  });
  
  await monitor.initialize();
  
  // Get current block number
  const latestBlock = await monitor.getCurrentBlockNumber();
  const fromBlock = latestBlock - 1000; // Last 1000 blocks
  
  console.log(`Querying Approval events for USDC from block ${fromBlock} to ${latestBlock}...\n`);
  
  try {
    const events = await monitor.getHistoricalApprovals(
      EXAMPLE_TOKENS.USDC,
      fromBlock,
      latestBlock
    );
    
    console.log(`Found ${events.length} Approval events:\n`);
    
    events.slice(0, 10).forEach((event, index) => {
      console.log(`${index + 1}. Block ${event.blockNumber}:`);
      console.log(`   Owner: ${event.owner}`);
      console.log(`   Spender: ${event.spender}`);
      console.log(`   Amount: ${event.amount}`);
      console.log(`   Tx: ${event.transactionHash}`);
      if (event.timestamp) {
        console.log(`   Time: ${event.timestamp.toISOString()}`);
      }
      console.log('');
    });
    
    if (events.length > 10) {
      console.log(`... and ${events.length - 10} more events\n`);
    }
    
  } catch (error) {
    console.error('Error querying historical events:', error.message);
  }
  
  monitor.stopAll();
}

/**
 * Example 5: Query historical events for multiple tokens
 */
async function example5_QueryMultipleTokens() {
  console.log('\n=== Example 5: Query Historical Events for Multiple Tokens ===\n');
  
  const monitor = new ERC20ApprovalMonitor({
    rpcUrl: config.ethereum.rpcUrl,
  });
  
  await monitor.initialize();
  
  const latestBlock = await monitor.getCurrentBlockNumber();
  const fromBlock = latestBlock - 1000;
  
  const tokensToQuery = [
    EXAMPLE_TOKENS.USDC,
    EXAMPLE_TOKENS.USDT,
  ];
  
  console.log(`Querying Approval events for ${tokensToQuery.length} tokens...\n`);
  
  try {
    const results = await monitor.getHistoricalApprovalsForTokens(
      tokensToQuery,
      fromBlock,
      latestBlock
    );
    
    results.forEach((events, tokenAddress) => {
      const tokenName = Object.keys(EXAMPLE_TOKENS).find(
        key => EXAMPLE_TOKENS[key].toLowerCase() === tokenAddress.toLowerCase()
      ) || 'UNKNOWN';
      
      console.log(`${tokenName} (${tokenAddress}): ${events.length} events`);
    });
    
  } catch (error) {
    console.error('Error querying historical events:', error.message);
  }
  
  monitor.stopAll();
}

/**
 * Example 6: Using event listeners (alternative to callbacks)
 */
async function example6_EventListeners() {
  console.log('\n=== Example 6: Using Event Listeners ===\n');
  
  const monitor = new ERC20ApprovalMonitor({
    rpcUrl: config.ethereum.rpcUrl,
  });
  
  await monitor.initialize();
  
  // Register event listener
  monitor.on('approval', (eventData) => {
    console.log('📝 Approval Event (via listener):');
    console.log(`  Token: ${eventData.tokenAddress}`);
    console.log(`  Owner: ${eventData.owner}`);
    console.log(`  Spender: ${eventData.spender}`);
    console.log(`  Amount: ${eventData.amount}`);
    console.log('---');
  });
  
  // Monitor token
  monitor.monitorToken(EXAMPLE_TOKENS.USDC);
  
  console.log('Monitoring USDC with event listeners...');
  console.log('Press Ctrl+C to stop\n');
  
  process.on('SIGINT', () => {
    console.log('\nStopping monitor...');
    monitor.stopAll();
    process.exit(0);
  });
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const exampleNumber = args[0] || '1';
  
  try {
    switch (exampleNumber) {
      case '1':
        await example1_MonitorSingleToken();
        break;
      case '2':
        await example2_MonitorMultipleTokens();
        break;
      case '3':
        await example3_MonitorAllApprovals();
        break;
      case '4':
        await example4_QueryHistoricalEvents();
        break;
      case '5':
        await example5_QueryMultipleTokens();
        break;
      case '6':
        await example6_EventListeners();
        break;
      default:
        console.log(`
ERC20 Approval Monitor Examples

Usage: node src/examples/erc20ApprovalMonitorExample.js [example_number]

Available Examples:
  1 - Monitor single token (default)
  2 - Monitor multiple tokens
  3 - Monitor all ERC20 Approval events
  4 - Query historical events for a token
  5 - Query historical events for multiple tokens
  6 - Using event listeners

Examples:
  node src/examples/erc20ApprovalMonitorExample.js 1
  node src/examples/erc20ApprovalMonitorExample.js 4
        `);
        process.exit(0);
    }
  } catch (error) {
    logger.error('Example failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  example1_MonitorSingleToken,
  example2_MonitorMultipleTokens,
  example3_MonitorAllApprovals,
  example4_QueryHistoricalEvents,
  example5_QueryMultipleTokens,
  example6_EventListeners,
};
