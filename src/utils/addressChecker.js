const { ethers } = require('ethers');
const fs = require('fs').promises;
const path = require('path');
const etherscan = require('./etherscan');
const config = require('../config');
const logger = require('./logger');

/**
 * Address type checker utility with file-based storage
 * Checks if Ethereum addresses are contracts or wallets (EOAs)
 * Stores results in address_types.json to avoid duplicate checks
 */

// File paths
const CACHE_DIR = path.join(__dirname, '../../cache');
const ADDRESS_TYPES_FILE = path.join(CACHE_DIR, 'address_types.json');
const CONTRACT_ADDRESSES_FILE = path.join(CACHE_DIR, 'contract_addresses.json');

// In-memory lookup (loaded from file on startup)
let addressTypes = {}; // { address: { isContract, addressType } }

/**
 * Ensure cache directory exists
 */
async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (error) {
    // Directory already exists or permission error
    console.warn(`Warning: Could not create cache directory: ${error.message}`);
  }
}

/**
 * Load address types from file on startup
 */
async function loadAddressTypes() {
  try {
    await ensureCacheDir();
    
    try {
      const data = await fs.readFile(ADDRESS_TYPES_FILE, 'utf8');
      const loaded = JSON.parse(data);
      
      // Migrate old format: if keys have block tags, extract just the address
      addressTypes = {};
      for (const [key, value] of Object.entries(loaded)) {
        // Check if key has block tag format: "address_blocknumber"
        const match = key.match(/^(0x[a-fA-F0-9]{40})(?:_\d+)?$/);
        if (match) {
          const addressKey = match[1].toLowerCase();
          // Only keep if we don't already have this address
          if (!addressTypes[addressKey]) {
            addressTypes[addressKey] = {
              isContract: value.isContract || false,
              addressType: value.addressType || (value.isContract ? 'contract' : 'wallet')
            };
          }
        } else if (key.match(/^0x[a-fA-F0-9]{40}$/i)) {
          // Valid address format, use as-is
          addressTypes[key.toLowerCase()] = {
            isContract: value.isContract || false,
            addressType: value.addressType || (value.isContract ? 'contract' : 'wallet')
          };
        }
      }
    } catch (error) {
      // File doesn't exist yet, start with empty object
      addressTypes = {};
    }
  } catch (error) {
    console.warn(`Warning: Failed to load address types: ${error.message}`);
    addressTypes = {};
  }
}

/**
 * Save address types to file
 */
async function saveAddressTypes() {
  try {
    await ensureCacheDir();
    
    // Write to file atomically using temporary file
    const tempFile = `${ADDRESS_TYPES_FILE}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(addressTypes, null, 2), 'utf8');
    await fs.rename(tempFile, ADDRESS_TYPES_FILE);
  } catch (error) {
    console.warn(`Warning: Failed to save address types: ${error.message}`);
  }
}

/**
 * Load contract addresses from file
 */
async function loadContractAddresses() {
  try {
    const data = await fs.readFile(CONTRACT_ADDRESSES_FILE, 'utf8');
    return new Set(JSON.parse(data));
  } catch (error) {
    // File doesn't exist yet, return empty set
    return new Set();
  }
}

/**
 * Save contract addresses to file
 */
async function saveContractAddresses(contractAddresses) {
  try {
    await ensureCacheDir();
    
    // Convert Set to array for JSON serialization
    const addressesArray = Array.from(contractAddresses).sort();
    
    // Write to file atomically
    const tempFile = `${CONTRACT_ADDRESSES_FILE}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(addressesArray, null, 2), 'utf8');
    await fs.rename(tempFile, CONTRACT_ADDRESSES_FILE);
  } catch (error) {
    console.warn(`Warning: Failed to save contract addresses: ${error.message}`);
  }
}

/**
 * Add contract address to the contract addresses file
 */
async function addContractAddress(address) {
  try {
    const normalizedAddress = ethers.getAddress(address).toLowerCase();
    const contractAddresses = await loadContractAddresses();
    
    if (!contractAddresses.has(normalizedAddress)) {
      contractAddresses.add(normalizedAddress);
      await saveContractAddresses(contractAddresses);
    }
  } catch (error) {
    console.warn(`Warning: Failed to add contract address to file: ${error.message}`);
  }
}

/**
 * Check if an Ethereum address is a contract or wallet (EOA)
 * Only checks via RPC if address is not already in address_types.json
 * Note: An address's type (contract/wallet) never changes, so we always check at 'latest'
 * @param {ethers.Provider} provider - Ethers.js provider
 * @param {string} address - Ethereum address to check
 * @returns {Promise<{isContract: boolean, addressType: string}>}
 */
async function checkAddressType(provider, address) {
  try {
    const normalizedAddress = ethers.getAddress(address).toLowerCase();
    
    // Check if address is already known (loaded from file)
    if (addressTypes[normalizedAddress]) {
      const cached = addressTypes[normalizedAddress];
      
      // If it's a contract, ensure it's in the contract addresses file
      if (cached.isContract) {
        await addContractAddress(normalizedAddress);
      }
      
      return {
        isContract: cached.isContract,
        addressType: cached.addressType
      };
    }
    
    // Address not found, check via RPC (always use 'latest' since address type never changes)
    const code = await provider.getCode(normalizedAddress, 'latest');
    const isContract = code !== '0x' && code !== null && code !== undefined && code.length > 2;
    
    const result = {
      isContract: isContract,
      addressType: isContract ? 'contract' : 'wallet'
    };
    
    // Store the result
    addressTypes[normalizedAddress] = result;
    
    // Save to file (async, don't wait)
    saveAddressTypes().catch(err => console.warn(`Warning: Failed to save address types: ${err.message}`));
    
    // If it's a contract, add to contract addresses file
    if (isContract) {
      await addContractAddress(normalizedAddress);
      
      // Fetch source code from Etherscan if enabled (checks if already fetched)
      let sourceCodeFetched = false;
      if (config.etherscan.fetchSourceCode && config.etherscan.fetchOnContractDetected) {
        try {
          // Wait for source code to be fetched before auditing
          const sourceResult = await fetchContractSourceCode(normalizedAddress);
          sourceCodeFetched = sourceResult !== null;
          if (sourceCodeFetched) {
            logger.debug(`Source code fetched successfully for ${normalizedAddress}`);
          }
        } catch (err) {
          logger.debug(`Source code fetch failed for ${normalizedAddress}: ${err.message}`);
          sourceCodeFetched = false;
        }
      } else {
        // If source fetching is disabled, check if source already exists
        const existingSource = await etherscan.getContractSourceCodeFilePath(normalizedAddress);
        sourceCodeFetched = existingSource !== null;
      }

      // Trigger audit only if source code is available
      if (config.audit && config.audit.enabled && config.audit.auditOnDetection) {
        if (sourceCodeFetched) {
          // Import audit integration (lazy load to avoid circular deps)
          const auditIntegration = require('./auditIntegration');
          // Audit asynchronously (don't block address checking)
          auditIntegration.auditOnDetection(normalizedAddress).catch(err => {
            logger.warn(`Audit failed for ${normalizedAddress}: ${err.message}`);
          });
        } else {
          logger.debug(`Skipping audit for ${normalizedAddress}: source code not available`);
        }
      }
    }
    
    return result;
  } catch (error) {
    // If we can't determine, assume wallet (safer assumption)
    const result = {
      isContract: false,
      addressType: 'unknown'
    };
    
    // Still store the error result to avoid repeated failed attempts
    const normalizedAddress = ethers.getAddress(address).toLowerCase();
    addressTypes[normalizedAddress] = result;
    saveAddressTypes().catch(() => {});
    
    return result;
  }
}

/**
 * Batch check multiple addresses
 * @param {ethers.Provider} provider - Ethers.js provider
 * @param {string[]} addresses - Array of Ethereum addresses
 * @returns {Promise<Map<string, {isContract: boolean, addressType: string}>>}
 */
async function checkAddressTypes(provider, addresses) {
  const results = new Map();
  
  // Check addresses in parallel (with batching to avoid overwhelming RPC)
  const batchSize = 5; // Smaller batches to be gentle on RPC
  for (let i = 0; i < addresses.length; i += batchSize) {
    const batch = addresses.slice(i, i + batchSize);
    const promises = batch.map(addr => 
      checkAddressType(provider, addr).then(result => ({ addr, result }))
    );
    
    try {
      const batchResults = await Promise.all(promises);
      batchResults.forEach(({ addr, result }) => {
        results.set(addr.toLowerCase(), result);
      });
    } catch (error) {
      // If batch fails, try individually
      for (const addr of batch) {
        try {
          const result = await checkAddressType(provider, addr);
          results.set(addr.toLowerCase(), result);
        } catch (err) {
          results.set(addr.toLowerCase(), {
            isContract: false,
            addressType: 'unknown'
          });
        }
      }
    }
  }
  
  return results;
}

/**
 * Clear the address types (both in-memory and file)
 */
async function clearCache() {
  addressTypes = {};
  try {
    await fs.unlink(ADDRESS_TYPES_FILE).catch(() => {});
    await fs.unlink(CONTRACT_ADDRESSES_FILE).catch(() => {});
  } catch (error) {
    // Files might not exist
  }
}

/**
 * Get cache statistics
 */
async function getCacheStats() {
  const contractAddresses = await loadContractAddresses();
  const addresses = Object.keys(addressTypes);
  const contracts = addresses.filter(addr => addressTypes[addr].isContract).length;
  const wallets = addresses.filter(addr => !addressTypes[addr].isContract).length;
  
  return {
    totalAddresses: addresses.length,
    contracts: contracts,
    wallets: wallets,
    contractAddressesInFile: contractAddresses.size
  };
}

/**
 * Get all contract addresses from file
 */
async function getContractAddresses() {
  try {
    return await loadContractAddresses();
  } catch (error) {
    return new Set();
  }
}

/**
 * Fetch contract source code from Etherscan (async, non-blocking)
 * Checks if already fetched (file exists) before fetching
 * @param {string} contractAddress - Contract address
 * @returns {Promise<string|null>} Source code content or null
 */
async function fetchContractSourceCode(contractAddress) {
  try {
    if (!config.etherscan.apiKey) {
      // No API key, skip
      return null;
    }
    
    // Use simplified fetch function that checks file existence
    return await etherscan.fetchAndSaveContractSourceCode(contractAddress);
  } catch (error) {
    // Silently fail - this is optional functionality
    return null;
  }
}

/**
 * Initialize the address types system (load from file)
 */
async function initializeCache() {
  await loadAddressTypes();
}

// Initialize on module load
initializeCache().catch(err => {
  console.warn(`Warning: Failed to initialize address types: ${err.message}`);
});

module.exports = {
  checkAddressType,
  checkAddressTypes,
  clearCache,
  getCacheStats,
  getContractAddresses,
  initializeCache,
  loadAddressTypes,
  saveAddressTypes,
  fetchContractSourceCode
};
