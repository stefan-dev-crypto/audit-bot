const https = require('https');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');

/**
 * Simplified Etherscan API utility for fetching contract source code
 * Based on _new_audit project implementation
 */

const SOURCES_DIR = path.join(__dirname, '../../sources');

/**
 * Ensure sources directory exists
 */
async function ensureSourcesDir() {
  try {
    await fs.mkdir(SOURCES_DIR, { recursive: true });
  } catch (error) {
    console.warn(`Warning: Could not create sources directory: ${error.message}`);
  }
}

/**
 * Make HTTP request to Etherscan API
 */
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const req = protocol.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Get contract source code from Etherscan API
 * Using correct v2 API format
 * @param {string} address - Contract address
 * @returns {Promise<string|null>} Source code or null if not available
 */
async function getContractSourceCode(address) {
  if (!config.etherscan.apiKey) {
    throw new Error('Etherscan API key not configured');
  }

  try {
    // Determine chain ID based on network
    const chainIds = {
      ethereum: '1',
    };
    
    const chainId = chainIds[config.etherscan.network] || '1';
    
    const params = new URLSearchParams({
      apikey: config.etherscan.apiKey,
      chainid: chainId,
      module: 'contract',
      action: 'getsourcecode',
      address: address,
    });

    // Use v2 API endpoint
    const url = `https://api.etherscan.io/v2/api?${params.toString()}`;
    const response = await makeRequest(url);

    if (response.status === '1' && response.result && response.result[0] && response.result[0].SourceCode) {
      console.log(`🚀 Successfully fetched source code`);
      return response.result[0].SourceCode;
    }
    
    return null;
  } catch (error) {
    console.debug(`Failed to fetch source code for ${address}: ${error.message}`);
    return null;
  }
}

/**
 * Check if contract source code already exists
 * @param {string} contractAddress - Contract address
 * @returns {Promise<string|null>} Directory path if exists, null otherwise
 */
async function getContractSourceCodeFilePath(contractAddress) {
  try {
    await ensureSourcesDir();
    const normalizedAddress = contractAddress.toLowerCase();
    const contractSourceDir = path.join(SOURCES_DIR, normalizedAddress);
    
    // Check if source directory exists
    try {
      await fs.access(contractSourceDir);
      return contractSourceDir;
    } catch (error) {
      return null;
    }
  } catch (error) {
    return null;
  }
}

/**
 * Save contract source code to files
 * Parses JSON format (Standard JSON Input) from Etherscan and extracts human-readable .sol files
 * Only saves human-readable format in sources/ directory
 * @param {string} contractAddress - Contract address
 * @param {string} sourceCode - Source code content (Standard JSON Input or plain Solidity)
 * @returns {Promise<string>} Directory path where sources are saved
 */
async function saveContractSourceCodeFile(contractAddress, sourceCode) {
  try {
    await ensureSourcesDir();
    
    const normalizedAddress = contractAddress.toLowerCase();
    const timestamp = new Date().toISOString();
    
    // Create a folder for this contract's sources
    const contractSourceDir = path.join(SOURCES_DIR, normalizedAddress);
    await fs.mkdir(contractSourceDir, { recursive: true });
    
    // Try to parse as JSON (Standard JSON Input format)
    let isJsonFormat = false;
    let parsedJson = null;
    
    try {
      // Remove extra braces if present
      let cleanedSource = sourceCode.trim();
      if (cleanedSource.startsWith('{{')) {
        cleanedSource = cleanedSource.substring(1, cleanedSource.length - 1);
      }
      parsedJson = JSON.parse(cleanedSource);
      isJsonFormat = true;
    } catch (e) {
      // Not JSON, treat as plain Solidity
      isJsonFormat = false;
    }
    
    if (isJsonFormat && parsedJson && parsedJson.sources) {
      // Standard JSON Input format - extract all source files
      console.log(`📦 Extracting ${Object.keys(parsedJson.sources).length} source files for ${normalizedAddress}`);
      
      // Extract and save each source file
      for (const [filePath, fileData] of Object.entries(parsedJson.sources)) {
        const content = fileData.content;
        const fullPath = path.join(contractSourceDir, filePath);
        
        // Create subdirectories if needed
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });
        
        // Save the file
        await fs.writeFile(fullPath, content, 'utf8');
      }
      
      // Save a README with metadata
      const readmePath = path.join(contractSourceDir, 'README.md');
      const readmeContent = `# Contract Source Code\n\n` +
        `**Address:** \`${normalizedAddress}\`\n` +
        `**Fetched:** ${timestamp}\n` +
        `**Language:** ${parsedJson.language || 'Solidity'}\n` +
        `**Compiler:** ${parsedJson.settings?.evmVersion || 'N/A'}\n` +
        `**Optimizer:** ${parsedJson.settings?.optimizer?.enabled ? 'Enabled' : 'Disabled'}\n` +
        (parsedJson.settings?.optimizer?.runs ? `**Optimizer Runs:** ${parsedJson.settings.optimizer.runs}\n` : '') +
        `\n## Source Files\n\n` +
        Object.keys(parsedJson.sources).map(f => `- ${f}`).join('\n');
      
      await fs.writeFile(readmePath, readmeContent, 'utf8');
      
    } else {
      // Plain Solidity code - save as single file
      const fileName = 'contract.sol';
      const filePath = path.join(contractSourceDir, fileName);
      
      // Add header comment
      const header = `// Contract Source Code\n`;
      const header2 = `// Address: ${normalizedAddress}\n`;
      const header3 = `// Fetched: ${timestamp}\n\n`;
      
      const finalContent = header + header2 + header3 + sourceCode;
      
      // Write to file
      await fs.writeFile(filePath, finalContent, 'utf8');
    }
    
    return contractSourceDir;
  } catch (error) {
    throw new Error(`Failed to save contract source code file: ${error.message}`);
  }
}

/**
 * Fetch and save contract source code if not already fetched
 * @param {string} contractAddress - Contract address
 * @returns {Promise<string|null>} Source code content or null
 */
async function fetchAndSaveContractSourceCode(contractAddress) {
  try {
    const normalizedAddress = contractAddress.toLowerCase();
    
    // Check if source code directory already exists
    const existingDir = await getContractSourceCodeFilePath(normalizedAddress);
    if (existingDir) {
      console.debug(`Source code already exists for ${normalizedAddress}, skipping fetch`);
      // Return the directory path to indicate it exists
      return existingDir;
    }
    
    // Fetch from Etherscan
    const sourceCode = await getContractSourceCode(normalizedAddress);
    
    if (sourceCode && sourceCode.trim() !== '') {
      // Save to sources directory
      const savedPath = await saveContractSourceCodeFile(normalizedAddress, sourceCode);
      console.log(`Saved source code for contract ${normalizedAddress} to ${savedPath}`);
      return savedPath;
    }
    
    return null;
  } catch (error) {
    console.debug(`Error fetching/saving source code for ${contractAddress}: ${error.message}`);
    return null;
  }
}

/**
 * Initialize sources directory
 */
async function initialize() {
  await ensureSourcesDir();
}

// Initialize on module load
initialize().catch(err => {
  console.warn(`Warning: Failed to initialize sources directory: ${err.message}`);
});

module.exports = {
  getContractSourceCode,
  fetchAndSaveContractSourceCode,
  getContractSourceCodeFilePath,
  saveContractSourceCodeFile,
  initialize
};
