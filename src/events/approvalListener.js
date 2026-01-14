/**
 * ERC20 Approval event listener module
 * Listens for and processes Approval events on the blockchain
 */

import { ethers } from 'ethers';
import { ERC20_ABI, APPROVAL_EVENT_TOPIC } from '../config/erc20.js';
import { isContract, fetchContractSource } from '../api/etherscan.js';
import { ContractTracker } from '../storage/contractTracker.js';

export class ApprovalListener {
  constructor(chainConfig, statistics = null) {
    this.chainConfig = chainConfig;
    this.provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    this.statistics = statistics;
    this.tracker = new ContractTracker('./data', statistics);
    this.isRunning = false;
    this.lastProcessedBlock = 0;
  }
  
  /**
   * Start listening for Approval events
   */
  async start() {
    console.log(`Starting approval listener on ${this.chainConfig.name}...`);
    console.log(`RPC URL: ${this.chainConfig.rpcUrl}`);
    
    this.isRunning = true;
    this.lastProcessedBlock = await this.provider.getBlockNumber();
    
    console.log(`Starting from block: ${this.lastProcessedBlock}`);
    console.log('Listening for ERC20 Approval events...');
    console.log('Press Ctrl+C to stop\n');
    
    // Use block polling instead of filters (more compatible with public RPCs)
    this.provider.on('block', async (blockNumber) => {
      await this.processBlock(blockNumber);
    });
  }
  
  /**
   * Process a new block and check for Approval events
   * @param {number} blockNumber - The block number to process
   */
  async processBlock(blockNumber) {
    // Skip if we've already processed this block
    if (blockNumber <= this.lastProcessedBlock) {
      return;
    }
    
    try {
      // Query logs for Approval events in this block
      const logs = await this.provider.getLogs({
        fromBlock: blockNumber,
        toBlock: blockNumber,
        topics: [APPROVAL_EVENT_TOPIC]
      });
      
      // Process each approval event found
      for (const log of logs) {
        await this.handleApprovalEvent(log);
      }
      
      this.lastProcessedBlock = blockNumber;
    } catch (error) {
      console.error(`Error processing block ${blockNumber}:`, error.message);
    }
  }
  
  /**
   * Stop listening for events
   */
  stop() {
    console.log('Stopping approval listener...');
    this.isRunning = false;
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
      
      // Fetch contract source code
      const contractData = await fetchContractSource(spender, this.chainConfig);
      
      if (contractData.verified) {
        const proxyInfo = contractData.proxy === '1' ? ` [Proxy→${contractData.implementation?.slice(0, 10)}...]` : '';
        console.log(`   ✅ Fetched: ${contractData.contractName || 'Unknown'}${proxyInfo} | Queued for audit`);
        
        // Save contract source as single flattened file
        this.tracker.saveContractSource(spender, contractData);
      } else {
        console.log(`   ⚠️  Not verified on Etherscan`);
      }
      
      // Mark contract as processed
      this.tracker.markAsProcessed(spender);
      
    } catch (error) {
      console.error('Error handling approval event:', error.message);
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
