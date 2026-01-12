require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Load default tokens from file
const loadDefaultTokens = () => {
  try {
    const tokensFilePath = path.join(__dirname, 'data', 'tokens.json');
    
    if (fs.existsSync(tokensFilePath)) {
      const tokensData = fs.readFileSync(tokensFilePath, 'utf8');
      return JSON.parse(tokensData);
    } else {
      // Fallback to minimal defaults if file doesn't exist
      console.warn(`Warning: tokens.json not found at ${tokensFilePath}, using minimal defaults`);
      return {
        USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      };
    }
  } catch (error) {
    console.warn(`Warning: Failed to load tokens.json: ${error.message}, using minimal defaults`);
    // Fallback to minimal defaults on error
    return {
      USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    };
  }
};

// Default tokens loaded from file
const defaultTokens = loadDefaultTokens();

// Parse tokens from environment variable (JSON object) or use defaults
const parseTokens = () => {
  if (process.env.ERC20_MONITOR_TOKENS) {
    try {
      // Try to parse as JSON object: {"USDC":"0x...","USDT":"0x..."}
      return JSON.parse(process.env.ERC20_MONITOR_TOKENS);
    } catch (error) {
      console.warn('Failed to parse ERC20_MONITOR_TOKENS as JSON, using default tokens');
      return defaultTokens;
    }
  }
  return defaultTokens;
};

const config = {
  // Ethereum Configuration
  ethereum: {
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://ethereum-rpc.publicnode.com',
    rpcUrlTestnet: process.env.ETHEREUM_RPC_URL_TESTNET || 'https://eth-sepolia.g.alchemy.com/v2/demo',
  },

  // Etherscan API Configuration
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || null,
    network: process.env.ETHERSCAN_NETWORK || 'ethereum', // ethereum chain
    fetchSourceCode: process.env.ETHERSCAN_FETCH_SOURCE_CODE === 'true' || true, // Auto-fetch source code for new contracts
    fetchOnContractDetected: process.env.ETHERSCAN_FETCH_ON_DETECT === 'true' || true, // Fetch immediately when contract detected
  },

  // ERC20 Monitoring Configuration
  erc20Monitoring: {
    tokens: parseTokens(),
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/audit_bot.log',
  },

  // Audit Configuration
  audit: {
    // Enable automatic auditing
    enabled: process.env.AUDIT_ENABLED === 'true' || true,
    
    // Audit on contract detection
    auditOnDetection: process.env.AUDIT_ON_DETECTION === 'true' || true,
    
    // Results directory
    resultsDir: process.env.AUDIT_RESULTS_DIR || './audit-results',
    
    // Auto-save results
    autoSave: process.env.AUDIT_AUTO_SAVE === 'true' || true,
    
    // Slither Configuration
    slither: {
      enabled: process.env.SLITHER_ENABLED === 'true' || true,
      path: process.env.SLITHER_PATH || 'slither',
      timeout: parseInt(process.env.SLITHER_TIMEOUT) || 120000, // 2 minutes
      additionalArgs: process.env.SLITHER_ARGS ? process.env.SLITHER_ARGS.split(',') : [],
      // Solidity version selection
      solcSelectPath: process.env.SOLC_SELECT_PATH || 'solc-select',
      autoSelectVersion: process.env.SLITHER_AUTO_SELECT_VERSION !== 'false', // Default: true
      restoreVersion: process.env.SLITHER_RESTORE_VERSION !== 'false', // Default: true
    },
    
    // Add other auditor configs here in the future
    // mythril: { ... },
    // manticore: { ... },
    // etc.
  },
};

module.exports = config;
