const { ethers } = require('ethers');
const logger = require('../utils/logger');
const config = require('../config');
const { checkAddressType } = require('../utils/addressChecker');

/**
 * ERC20 Approval Event Monitor
 * 
 * Monitors ERC20 token Approval events on Ethereum chain.
 * Supports multiple monitoring modes:
 * - Specific token monitoring
 * - Multiple token monitoring
 * - All ERC20 events monitoring
 * - Historical event queries
 */
class ERC20ApprovalMonitor {
  constructor(options = {}) {
    this.rpcUrl = options.rpcUrl || config.ethereum.rpcUrl;
    this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
    this.isRunning = false;
    this.contracts = new Map(); // tokenAddress -> contract instance
    this.listeners = {};
    this.pollingIntervals = new Map(); // tokenAddress -> intervalId (for polling-based monitoring)
    this.checkAddressTypes = options.checkAddressTypes !== false; // Default to true, can be disabled for performance
    
    // ERC20 ABI - only need the Approval event
    this.ERC20_ABI = [
      "event Approval(address indexed owner, address indexed spender, uint256 value)"
    ];
    
    // Approval event signature: keccak256("Approval(address,address,uint256)")
    this.APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
    
    // Event interface for parsing
    this.eventInterface = new ethers.Interface(this.ERC20_ABI);
  }

  /**
   * Initialize the monitor
   */
  async initialize() {
    try {
      // Initialize address type cache (load from files)
      const { initializeCache } = require('../utils/addressChecker');
      await initializeCache();
      logger.debug('Address type cache loaded from files');
      
      // Test connection
      const blockNumber = await this.provider.getBlockNumber();
      logger.info(`ERC20ApprovalMonitor initialized. Connected to block ${blockNumber}`);
      return true;
    } catch (error) {
      logger.error('Failed to initialize ERC20ApprovalMonitor:', error);
      throw error;
    }
  }

  /**
   * Monitor Approval events for a specific token
   * @param {string} tokenAddress - ERC20 token contract address
   * @param {function} callback - Callback function(eventData) to handle events
   * @param {object} options - Options: { usePolling: boolean, pollInterval: number }
   */
  monitorToken(tokenAddress, callback, options = {}) {
    try {
      const normalizedAddress = ethers.getAddress(tokenAddress);
      const usePolling = options.usePolling !== false; // Default to polling to avoid filter errors
      const pollInterval = options.pollInterval || 3000; // 3 seconds default
      
      // Create contract instance if not exists
      if (!this.contracts.has(normalizedAddress)) {
        const contract = new ethers.Contract(normalizedAddress, this.ERC20_ABI, this.provider);
        this.contracts.set(normalizedAddress, contract);
        
        if (usePolling) {
          // Use polling-based approach (more reliable with public RPC endpoints)
          let lastBlock = null;
          const pollingToken = normalizedAddress;
          
          const pollForEvents = async () => {
            try {
              const currentBlock = await this.provider.getBlockNumber();
              
              if (lastBlock === null) {
                lastBlock = currentBlock - 1;
              }
              
              if (currentBlock > lastBlock) {
                // Query events for this token
                const filter = contract.filters.Approval();
                const events = await contract.queryFilter(filter, lastBlock + 1, currentBlock);
                
                for (const event of events) {
                  const [owner, spender, value] = event.args;
                  
                  // Get block timestamp
                  let timestamp = null;
                  try {
                    const block = await this.provider.getBlock(event.blockNumber);
                    timestamp = new Date(block.timestamp * 1000);
                  } catch (err) {
                    // Ignore timestamp errors
                  }
                  
                  // Check address types if enabled
                  let ownerType = null;
                  let spenderType = null;
                  if (this.checkAddressTypes) {
                    try {
                      [ownerType, spenderType] = await Promise.all([
                        checkAddressType(this.provider, owner),
                        checkAddressType(this.provider, spender)
                      ]);
                    } catch (err) {
                      logger.debug(`Failed to check address types: ${err.message}`);
                    }
                  }
                  
                  const eventData = {
                    tokenAddress: pollingToken,
                    owner: owner,
                    spender: spender,
                    amount: value.toString(),
                    blockNumber: event.blockNumber,
                    transactionHash: event.transactionHash,
                    logIndex: event.logIndex,
                    timestamp: timestamp,
                    // Address type information
                    ownerType: ownerType ? ownerType.addressType : null,
                    ownerIsContract: ownerType ? ownerType.isContract : null,
                    spenderType: spenderType ? spenderType.addressType : null,
                    spenderIsContract: spenderType ? spenderType.isContract : null,
                  };
                  
                  // Call callback
                  if (callback) {
                    try {
                      callback(eventData);
                    } catch (err) {
                      logger.error('Error in Approval event callback:', err);
                    }
                  }
                  
                  // Emit event for internal listeners
                  this.emit('approval', eventData);
                }
                
                lastBlock = currentBlock;
              }
            } catch (error) {
              // Suppress filter errors and other non-critical errors
              if (!error.message || (!error.message.includes('filter not found') && !error.message.includes('UNKNOWN_ERROR'))) {
                logger.debug(`Error polling events for ${pollingToken}:`, error.message);
              }
            }
          };
          
          // Start polling
          const pollIntervalId = setInterval(pollForEvents, pollInterval);
          
          // Store interval ID for cleanup
          if (!this.pollingIntervals) {
            this.pollingIntervals = new Map();
          }
          this.pollingIntervals.set(normalizedAddress, pollIntervalId);
          
          // Initial poll
          pollForEvents();
          
          logger.info(`Monitoring Approval events for token (polling): ${normalizedAddress}`);
        } else {
          // Use filter-based approach (may not work with all RPC providers)
          contract.on("Approval", async (owner, spender, value, event) => {
            // Check address types if enabled
            let ownerType = null;
            let spenderType = null;
            if (this.checkAddressTypes) {
              try {
                [ownerType, spenderType] = await Promise.all([
                  checkAddressType(this.provider, owner),
                  checkAddressType(this.provider, spender)
                ]);
              } catch (err) {
                logger.debug(`Failed to check address types: ${err.message}`);
              }
            }
            
            const eventData = {
              tokenAddress: normalizedAddress,
              owner: owner,
              spender: spender,
              amount: value.toString(),
              blockNumber: event.log.blockNumber,
              transactionHash: event.log.transactionHash,
              logIndex: event.log.index,
              timestamp: null,
              // Address type information
              ownerType: ownerType ? ownerType.addressType : null,
              ownerIsContract: ownerType ? ownerType.isContract : null,
              spenderType: spenderType ? spenderType.addressType : null,
              spenderIsContract: spenderType ? spenderType.isContract : null,
            };
            
            if (callback) {
              try {
                callback(eventData);
              } catch (err) {
                logger.error('Error in Approval event callback:', err);
              }
            }
            
            this.emit('approval', eventData);
          });
          
          // Suppress filter errors (non-fatal)
          contract.on("error", (error) => {
            if (error.code === 'UNKNOWN_ERROR' && error.error && error.error.message === 'filter not found') {
              // Suppress these errors - they're non-fatal and events still work
              return;
            }
            logger.error(`Contract event error for ${normalizedAddress}:`, error);
          });
          
          logger.info(`Monitoring Approval events for token (filter-based): ${normalizedAddress}`);
        }
      } else {
        logger.warn(`Token ${normalizedAddress} is already being monitored`);
      }
      
      return true;
    } catch (error) {
      logger.error(`Failed to monitor token ${tokenAddress}:`, error);
      throw error;
    }
  }

  /**
   * Monitor Approval events for multiple tokens
   * @param {string[]} tokenAddresses - Array of ERC20 token contract addresses
   * @param {function} callback - Callback function(eventData) to handle events
   */
  monitorTokens(tokenAddresses, callback) {
    tokenAddresses.forEach(address => {
      this.monitorToken(address, callback);
    });
    
    logger.info(`Monitoring Approval events for ${tokenAddresses.length} tokens`);
    return true;
  }

  /**
   * Monitor all ERC20 Approval events on the network
   * This listens to new blocks and filters for Approval events
   * @param {function} callback - Callback function(eventData) to handle events
   */
  monitorAllApprovals(callback) {
    if (this.isRunning) {
      logger.warn('Monitor is already running');
      return;
    }

    this.isRunning = true;
    
    this.provider.on("block", async (blockNumber) => {
      try {
        const block = await this.provider.getBlock(blockNumber, true);
        
        if (!block || !block.logs) {
          return;
        }
        
        // Filter logs for Approval events
        const approvalLogs = block.logs.filter(log => 
          log.topics && log.topics[0] === this.APPROVAL_TOPIC && log.topics.length === 3
        );
        
        if (approvalLogs.length > 0) {
          logger.debug(`Block ${blockNumber}: Found ${approvalLogs.length} Approval events`);
          
          for (const log of approvalLogs) {
            try {
              const parsedLog = this.eventInterface.parseLog({
                topics: log.topics,
                data: log.data
              });
              
              const [owner, spender, value] = parsedLog.args;
              
              // Check address types if enabled
              let ownerType = null;
              let spenderType = null;
              if (this.checkAddressTypes) {
                try {
                    [ownerType, spenderType] = await Promise.all([
                      checkAddressType(this.provider, owner),
                      checkAddressType(this.provider, spender)
                    ]);
                } catch (err) {
                  logger.debug(`Failed to check address types: ${err.message}`);
                }
              }
              
              const eventData = {
                tokenAddress: log.address,
                owner: owner,
                spender: spender,
                amount: value.toString(),
                blockNumber: log.blockNumber,
                transactionHash: log.transactionHash,
                logIndex: log.index,
                timestamp: new Date(block.timestamp * 1000),
                // Address type information
                ownerType: ownerType ? ownerType.addressType : null,
                ownerIsContract: ownerType ? ownerType.isContract : null,
                spenderType: spenderType ? spenderType.addressType : null,
                spenderIsContract: spenderType ? spenderType.isContract : null,
              };
              
              // Call callback
              if (callback) {
                try {
                  callback(eventData);
                } catch (err) {
                  logger.error('Error in Approval event callback:', err);
                }
              }
              
              // Emit event for internal listeners
              this.emit('approval', eventData);
              
            } catch (err) {
              logger.debug(`Error parsing Approval log in block ${blockNumber}:`, err.message);
            }
          }
        }
      } catch (error) {
        logger.error(`Error processing block ${blockNumber}:`, error.message);
      }
    });
    
    logger.info('Monitoring all ERC20 Approval events on Ethereum...');
    return true;
  }

  /**
   * Query historical Approval events for a specific token
   * @param {string} tokenAddress - ERC20 token contract address
   * @param {number} fromBlock - Starting block number (optional, defaults to latest - 1000)
   * @param {number} toBlock - Ending block number (optional, defaults to latest)
   * @returns {Promise<Array>} Array of event data objects
   */
  async getHistoricalApprovals(tokenAddress, fromBlock = null, toBlock = null) {
    try {
      const normalizedAddress = ethers.getAddress(tokenAddress);
      const contract = new ethers.Contract(normalizedAddress, this.ERC20_ABI, this.provider);
      
      // Set default block range if not provided
      if (toBlock === null) {
        toBlock = await this.provider.getBlockNumber();
      }
      if (fromBlock === null) {
        fromBlock = Math.max(0, toBlock - 1000);
      }
      
      logger.info(`Querying Approval events for ${normalizedAddress} from block ${fromBlock} to ${toBlock}`);
      
      // Query events
      const filter = contract.filters.Approval();
      const events = await contract.queryFilter(filter, fromBlock, toBlock);
      
      const eventDataArray = [];
      
      for (const event of events) {
        const [owner, spender, value] = event.args;
        
        // Get block timestamp
        let timestamp = null;
        try {
          const block = await this.provider.getBlock(event.blockNumber);
          timestamp = new Date(block.timestamp * 1000);
        } catch (err) {
          logger.debug(`Could not fetch timestamp for block ${event.blockNumber}`);
        }
        
        eventDataArray.push({
          tokenAddress: normalizedAddress,
          owner: owner,
          spender: spender,
          amount: value.toString(),
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
          logIndex: event.logIndex,
          timestamp: timestamp,
        });
      }
      
      logger.info(`Found ${eventDataArray.length} Approval events for ${normalizedAddress}`);
      return eventDataArray;
      
    } catch (error) {
      logger.error(`Failed to get historical approvals for ${tokenAddress}:`, error);
      throw error;
    }
  }

  /**
   * Query historical Approval events for multiple tokens
   * @param {string[]} tokenAddresses - Array of ERC20 token contract addresses
   * @param {number} fromBlock - Starting block number
   * @param {number} toBlock - Ending block number
   * @returns {Promise<Map>} Map of tokenAddress -> event data array
   */
  async getHistoricalApprovalsForTokens(tokenAddresses, fromBlock = null, toBlock = null) {
    const results = new Map();
    
    for (const address of tokenAddresses) {
      try {
        const events = await this.getHistoricalApprovals(address, fromBlock, toBlock);
        results.set(address, events);
      } catch (error) {
        logger.error(`Failed to get historical approvals for ${address}:`, error);
        results.set(address, []);
      }
    }
    
    return results;
  }

  /**
   * Stop monitoring a specific token
   * @param {string} tokenAddress - ERC20 token contract address
   */
  stopMonitoringToken(tokenAddress) {
    try {
      const normalizedAddress = ethers.getAddress(tokenAddress);
      const contract = this.contracts.get(normalizedAddress);
      
      if (contract) {
        // Stop filter-based listeners
        contract.removeAllListeners("Approval");
        contract.removeAllListeners("error");
        
        // Stop polling-based monitoring
        if (this.pollingIntervals && this.pollingIntervals.has(normalizedAddress)) {
          clearInterval(this.pollingIntervals.get(normalizedAddress));
          this.pollingIntervals.delete(normalizedAddress);
        }
        
        this.contracts.delete(normalizedAddress);
        logger.info(`Stopped monitoring token: ${normalizedAddress}`);
        return true;
      } else {
        logger.warn(`Token ${normalizedAddress} is not being monitored`);
        return false;
      }
    } catch (error) {
      logger.error(`Failed to stop monitoring token ${tokenAddress}:`, error);
      throw error;
    }
  }

  /**
   * Stop all monitoring
   */
  stopAll() {
    // Stop all contract listeners
    this.contracts.forEach((contract, address) => {
      contract.removeAllListeners("Approval");
      contract.removeAllListeners("error");
    });
    this.contracts.clear();
    
    // Stop all polling intervals
    if (this.pollingIntervals) {
      this.pollingIntervals.forEach((intervalId) => {
        clearInterval(intervalId);
      });
      this.pollingIntervals.clear();
    }
    
    // Stop block monitoring
    if (this.isRunning) {
      this.provider.removeAllListeners("block");
      this.isRunning = false;
    }
    
    logger.info('Stopped all Approval event monitoring');
  }

  /**
   * Event emitter functionality for internal use
   */
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          logger.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Register event listener
   * @param {string} event - Event name ('approval')
   * @param {function} callback - Callback function
   */
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {function} callback - Callback function to remove
   */
  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  /**
   * Get the current block number
   * @returns {Promise<number>} Current block number
   */
  async getCurrentBlockNumber() {
    return await this.provider.getBlockNumber();
  }

  /**
   * Get the provider instance (for advanced usage)
   * @returns {ethers.JsonRpcProvider} Provider instance
   */
  getProvider() {
    return this.provider;
  }

  /**
   * Get monitoring statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      monitoredTokens: Array.from(this.contracts.keys()),
      totalMonitoredTokens: this.contracts.size,
      rpcUrl: this.rpcUrl,
    };
  }
}

module.exports = ERC20ApprovalMonitor;
