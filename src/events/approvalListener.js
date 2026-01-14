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
      
      console.log('\n' + '='.repeat(80));
      console.log('🔔 New Approval Event Detected');
      console.log('='.repeat(80));
      console.log(`Token:        ${log.address}`);
      console.log(`Owner:        ${owner}`);
      console.log(`Spender:      ${spender}`);
      console.log(`Value:        ${value.toString()}`);
      console.log(`Block:        ${log.blockNumber}`);
      console.log(`Tx Hash:      ${log.transactionHash}`);
      
      // Check if spender is a contract
      const spenderIsContract = await isContract(spender, this.provider);
      
      if (!spenderIsContract) {
        console.log('ℹ️  Spender is not a contract (EOA), skipping...');
        return;
      }
      
      console.log('✅ Spender is a contract');
      
      // Check if we've already processed this contract
      if (this.tracker.isProcessed(spender)) {
        console.log('ℹ️  Contract already processed, skipping duplicate fetch...');
        console.log('='.repeat(80) + '\n');
        return;
      }
      
      console.log('🔍 Fetching contract source code from Etherscan...');
      
      // Fetch contract source code
      const contractData = await fetchContractSource(spender, this.chainConfig);
      
      if (contractData.verified) {
        console.log('✅ Contract source code fetched successfully');
        console.log(`   Contract Name: ${contractData.contractName}`);
        console.log(`   Compiler:      ${contractData.compilerVersion}`);
        console.log(`   License:       ${contractData.licenseType}`);
        console.log(`   Proxy:         ${contractData.proxy === '1' ? 'Yes' : 'No'}`);
        
        if (contractData.proxy === '1' && contractData.implementation) {
          console.log(`   Implementation: ${contractData.implementation}`);
        }
        
        // Save contract source as single flattened file
        const sourceFilePath = this.tracker.saveContractSource(spender, contractData);
        
        // Note: Auditing happens in parallel via BackgroundAuditor
        // The source file will be audited automatically by the background process
        if (sourceFilePath) {
          console.log(`   ℹ️  Contract queued for background auditing`);
        }
      } else {
        console.log('⚠️  Contract source code not verified on Etherscan');
      }
      
      // Mark contract as processed
      this.tracker.markAsProcessed(spender);
      
      console.log('='.repeat(80) + '\n');
      
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
