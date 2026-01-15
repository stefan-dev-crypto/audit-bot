/**
 * ERC20 Event listener module
 * Listens for and processes Approval events on the blockchain
 * NOTE: Transfer event detection is BLOCKED
 */

import { ethers } from 'ethers';
import { ERC20_ABI, APPROVAL_EVENT_TOPIC, TRANSFER_EVENT_TOPIC } from '../config/erc20.js';
import { isContract } from '../api/etherscan.js';
import { ContractTracker } from '../storage/contractTracker.js';
import { getTokenBalance, calculateContractValue, fetchTokenPrices, getDexScreenerChainId } from '../utils/tokenValueCalculator.js';

export class ApprovalListener {
  constructor(chainConfig, statistics = null) {
    this.chainConfig = chainConfig;
    this.provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    this.statistics = statistics;
    this.tracker = new ContractTracker('./data', statistics);
    this.isRunning = false;
    this.lastProcessedBlock = 0;
    this.dexScreenerChainId = getDexScreenerChainId(chainConfig.chainId);
    this.minValueUsd = 1000; // Minimum $1000 in token holdings
    this.pendingValueChecks = []; // Queue for batch value checking
    this.valueCheckInterval = null;
  }
  
  /**
   * Start listening for Approval events (Transfer events BLOCKED)
   */
  async start() {
    console.log(`Starting ERC20 event listener on ${this.chainConfig.name}...`);
    console.log(`RPC URL: ${this.chainConfig.rpcUrl}`);
    console.log(`Value filtering: Only recording contracts with ≥$${this.minValueUsd} in token holdings\n`);
    
    this.isRunning = true;
    this.lastProcessedBlock = await this.provider.getBlockNumber();
    
    console.log(`Starting from block: ${this.lastProcessedBlock}`);
    console.log('Listening for ERC20 Approval events (Transfer events BLOCKED)...');
    console.log('Press Ctrl+C to stop\n');
    
    // Start batch value checking interval (every 5 seconds)
    this.valueCheckInterval = setInterval(async () => {
      await this.processPendingValueChecks();
    }, 5000);
    
    // Use block polling instead of filters (more compatible with public RPCs)
    this.provider.on('block', async (blockNumber) => {
      await this.processBlock(blockNumber);
    });
  }
  
  /**
   * Process a new block and check for Approval events (Transfer events BLOCKED)
   * @param {number} blockNumber - The block number to process
   */
  async processBlock(blockNumber) {
    // Skip if we've already processed this block
    if (blockNumber <= this.lastProcessedBlock) {
      return;
    }
    
    try {
      // Query logs for Approval events in this block
      const approvalLogs = await this.provider.getLogs({
        fromBlock: blockNumber,
        toBlock: blockNumber,
        topics: [APPROVAL_EVENT_TOPIC]
      });
      
      // BLOCKED: Query logs for Transfer events in this block
      // const transferLogs = await this.provider.getLogs({
      //   fromBlock: blockNumber,
      //   toBlock: blockNumber,
      //   topics: [TRANSFER_EVENT_TOPIC]
      // });
      
      // Process each approval event found
      for (const log of approvalLogs) {
        await this.handleApprovalEvent(log);
      }
      
      // BLOCKED: Process each transfer event found
      // for (const log of transferLogs) {
      //   await this.handleTransferEvent(log);
      // }
      
      this.lastProcessedBlock = blockNumber;
    } catch (error) {
      console.error(`Error processing block ${blockNumber}:`, error.message);
    }
  }
  
  /**
   * Stop listening for events
   */
  stop() {
    console.log('Stopping ERC20 event listener...');
    this.isRunning = false;
    if (this.valueCheckInterval) {
      clearInterval(this.valueCheckInterval);
    }
    this.provider.removeAllListeners();
  }
  
  /**
   * Handle an Approval event
   * @param {Object} log - The event log
   */
  async handleApprovalEvent(log) {
    try {
      // Parse the log
      const iface = new ethers.Interface(ERC20_ABI);
      const parsed = iface.parseLog({
        topics: log.topics,
        data: log.data
      });
      
      const owner = parsed.args.owner;
      const spender = parsed.args.spender;
      const value = parsed.args.value;
      
      // Check if spender is a contract
      const spenderIsContract = await isContract(spender, this.provider);
      
      if (!spenderIsContract) {
        return; // Skip EOA addresses silently
      }
      
      // Check if we've already processed this contract
      if (this.tracker.isProcessed(spender)) {
        return; // Skip already processed contracts silently
      }
      
      console.log(`🔔 Approval → Spender: ${spender} | Token: ${log.address}`);
      
      // Queue for value checking (will be processed in batches)
      this.queueForValueCheck(spender, log.address);
      
    } catch (error) {
      console.error('Error handling approval event:', error.message);
    }
  }
  
  /**
   * Handle a Transfer event
   * @param {Object} log - The event log
   */
  async handleTransferEvent(log) {
    try {
      // Parse the log
      const iface = new ethers.Interface(ERC20_ABI);
      const parsed = iface.parseLog({
        topics: log.topics,
        data: log.data
      });
      
      const from = parsed.args.from;
      const to = parsed.args.to;
      const value = parsed.args.value;
      
      // Check both 'from' and 'to' addresses if they are contracts
      const fromIsContract = await isContract(from, this.provider);
      const toIsContract = await isContract(to, this.provider);
      
      let contractsToProcess = [];
      
      // Process 'from' address if it's a contract
      if (fromIsContract && !this.tracker.isProcessed(from)) {
        contractsToProcess.push({ address: from, type: 'from' });
      }
      
      // Process 'to' address if it's a contract
      if (toIsContract && !this.tracker.isProcessed(to)) {
        contractsToProcess.push({ address: to, type: 'to' });
      }
      
      // If no contracts to process, skip silently
      if (contractsToProcess.length === 0) {
        return;
      }
      
      // Process each contract found
      for (const { address, type } of contractsToProcess) {
        console.log(`🔔 Transfer → ${type === 'from' ? 'From' : 'To'}: ${address} | Token: ${log.address}`);
        
        // Queue for value checking (will be processed in batches)
        this.queueForValueCheck(address, log.address);
      }
      
    } catch (error) {
      console.error('Error handling transfer event:', error.message);
    }
  }
  
  /**
   * Queue a contract for value checking
   * @param {string} contractAddress - Contract address
   * @param {string} tokenAddress - Token address
   */
  queueForValueCheck(contractAddress, tokenAddress) {
    // Add to pending queue if not already queued
    const existing = this.pendingValueChecks.find(
      item => item.contractAddress.toLowerCase() === contractAddress.toLowerCase()
    );
    
    if (!existing) {
      this.pendingValueChecks.push({ contractAddress, tokenAddress });
      console.log(`   ⏳ Queued for value check (${this.pendingValueChecks.length} pending)`);
    }
  }

  /**
   * Process pending value checks in batch
   */
  async processPendingValueChecks() {
    if (this.pendingValueChecks.length === 0) {
      return;
    }

    // Take up to 30 items for batch processing
    const batch = this.pendingValueChecks.splice(0, 30);
    
    console.log(`\n💰 Checking token values for ${batch.length} contract(s)...`);

    try {
      // Extract unique token addresses
      const uniqueTokens = [...new Set(batch.map(item => item.tokenAddress.toLowerCase()))];
      
      // Fetch token prices in batch
      console.log(`   📊 Fetching prices for ${uniqueTokens.length} token(s)...`);
      const priceMap = await fetchTokenPrices(this.dexScreenerChainId, uniqueTokens);
      
      const foundPrices = Object.keys(priceMap).length;
      console.log(`   💰 Found prices for ${foundPrices}/${uniqueTokens.length} token(s)`);

      // Check each contract's value
      for (const item of batch) {
        const tokenAddressLower = item.tokenAddress.toLowerCase();
        
        // Skip if no price data
        if (!priceMap[tokenAddressLower]) {
          console.log(`   ⏭️  ${item.contractAddress}: No price data for token ${item.tokenAddress}`);
          continue;
        }

        const tokenInfo = priceMap[tokenAddressLower];
        const tokenPrice = tokenInfo.price;

        // Get token balance and decimals
        const balanceInfo = await getTokenBalance(item.tokenAddress, item.contractAddress, this.provider);
        
        if (!balanceInfo) {
          console.log(`   ⏭️  ${item.contractAddress}: Failed to get balance`);
          continue;
        }

        // Calculate value
        const value = calculateContractValue(balanceInfo.balance, balanceInfo.decimals, tokenPrice);

        // Only record if meets threshold
        if (value >= this.minValueUsd) {
          this.tracker.markAsProcessed(item.contractAddress, item.tokenAddress);
          console.log(`   💎 ${item.contractAddress}: $${value.toFixed(2)} in ${tokenInfo.symbol} → ✅ Recorded`);
        } else {
          console.log(`   ⏭️  ${item.contractAddress}: $${value.toFixed(2)} in ${tokenInfo.symbol} (below $${this.minValueUsd} threshold)`);
        }
      }

      console.log(`   ✅ Batch complete\n`);

    } catch (error) {
      console.error('Error processing value checks:', error.message);
      // Re-queue failed items for retry
      this.pendingValueChecks.push(...batch);
    }
  }

  /**
   * Get tracker statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return this.tracker.getStats();
  }
}
