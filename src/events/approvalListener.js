/**
 * ERC20 Event listener module
 * Listens for and processes Approval and Transfer events on the blockchain
 */

import { ethers } from 'ethers';
import { ERC20_ABI, APPROVAL_EVENT_TOPIC, TRANSFER_EVENT_TOPIC } from '../config/erc20.js';
import { isContract } from '../api/etherscan.js';
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
   * Start listening for Approval and Transfer events
   */
  async start() {
    console.log(`Starting ERC20 event listener on ${this.chainConfig.name}...`);
    console.log(`RPC URL: ${this.chainConfig.rpcUrl}`);
    
    this.isRunning = true;
    this.lastProcessedBlock = await this.provider.getBlockNumber();
    
    console.log(`Starting from block: ${this.lastProcessedBlock}`);
    console.log('Listening for ERC20 Approval and Transfer events...');
    console.log('Press Ctrl+C to stop\n');
    
    // Use block polling instead of filters (more compatible with public RPCs)
    this.provider.on('block', async (blockNumber) => {
      await this.processBlock(blockNumber);
    });
  }
  
  /**
   * Process a new block and check for Approval and Transfer events
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
      
      // Query logs for Transfer events in this block
      const transferLogs = await this.provider.getLogs({
        fromBlock: blockNumber,
        toBlock: blockNumber,
        topics: [TRANSFER_EVENT_TOPIC]
      });
      
      // Process each approval event found
      for (const log of approvalLogs) {
        await this.handleApprovalEvent(log);
      }
      
      // Process each transfer event found
      for (const log of transferLogs) {
        await this.handleTransferEvent(log);
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
    console.log('Stopping ERC20 event listener...');
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
      
      // In combined mode, just record the address - fetching/auditing happens in BackgroundProcessor
      // Mark contract as processed (queued for processing)
      this.tracker.markAsProcessed(spender);
      console.log(`   ✅ Queued for processing`);
      
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
        
        // Mark contract as processed (queued for processing)
        this.tracker.markAsProcessed(address);
        console.log(`   ✅ Queued for processing`);
      }
      
    } catch (error) {
      console.error('Error handling transfer event:', error.message);
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
