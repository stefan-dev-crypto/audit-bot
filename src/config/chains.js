/**
 * Chain configuration module
 * Defines settings for different EVM chains
 */

export const CHAINS = {
  ethereum: {
    name: 'Ethereum',
    chainId: 1,
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://ethereum.publicnode.com',
    explorerApiUrl: 'https://api.etherscan.io/v2/api',
    explorerApiKey: process.env.ETHERSCAN_API_KEY || '',
    startBlock: 'latest', // Can be set to a specific block number
  },
  // Future chains can be added here
  // bsc: {
  //   name: 'BSC',
  //   chainId: 56,
  //   rpcUrl: process.env.BSC_RPC_URL || '',
  //   explorerApiUrl: 'https://api.bscscan.com/api',
  //   explorerApiKey: process.env.BSCSCAN_API_KEY || '',
  //   startBlock: 'latest',
  // },
  // base: {
  //   name: 'Base',
  //   chainId: 8453,
  //   rpcUrl: process.env.BASE_RPC_URL || '',
  //   explorerApiUrl: 'https://api.basescan.org/api',
  //   explorerApiKey: process.env.BASESCAN_API_KEY || '',
  //   startBlock: 'latest',
  // },
  // arbitrum: {
  //   name: 'Arbitrum',
  //   chainId: 42161,
  //   rpcUrl: process.env.ARBITRUM_RPC_URL || '',
  //   explorerApiUrl: 'https://api.arbiscan.io/api',
  //   explorerApiKey: process.env.ARBISCAN_API_KEY || '',
  //   startBlock: 'latest',
  // },
};

/**
 * Get configuration for a specific chain
 * @param {string} chainName - Name of the chain (e.g., 'ethereum', 'bsc')
 * @returns {Object} Chain configuration
 */
export function getChainConfig(chainName) {
  const config = CHAINS[chainName.toLowerCase()];
  if (!config) {
    throw new Error(`Chain configuration not found for: ${chainName}`);
  }
  return config;
}

/**
 * Get all configured chains
 * @returns {Array<string>} Array of chain names
 */
export function getAvailableChains() {
  return Object.keys(CHAINS);
}
