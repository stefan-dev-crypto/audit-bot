/**
 * Example: Using Etherscan API to fetch contract source code
 */

const etherscan = require('../utils/etherscan');
const config = require('../config');

async function example() {
  console.log('=== Etherscan Contract Source Code Example ===\n');
  
  // Example contract addresses
  const contracts = [
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
  ];
  
  for (const contractAddress of contracts) {
    try {
      console.log(`\nFetching source code for: ${contractAddress}`);
      console.log('---');
      
      const sourceData = await etherscan.getContractSourceCode(
        contractAddress,
        config.etherscan.apiKey,
        config.etherscan.network
      );
      
      console.log(`Contract Name: ${sourceData.contractName}`);
      console.log(`Compiler Version: ${sourceData.compilerVersion}`);
      console.log(`Optimization: ${sourceData.optimization ? 'Yes' : 'No'}`);
      console.log(`Verified: ${sourceData.isVerified ? 'Yes' : 'No'}`);
      console.log(`Proxy: ${sourceData.proxy ? 'Yes' : 'No'}`);
      console.log(`License: ${sourceData.license}`);
      
      if (sourceData.abi) {
        console.log(`ABI Functions: ${sourceData.abi.filter(item => item.type === 'function').length}`);
      }
      
      if (sourceData.sourceCode) {
        const codeLength = sourceData.sourceCode.length;
        console.log(`Source Code Length: ${codeLength} characters`);
        if (codeLength < 500) {
          console.log(`\nSource Code Preview:\n${sourceData.sourceCode.substring(0, 200)}...`);
        }
      }
      
    } catch (error) {
      console.error(`Error fetching source for ${contractAddress}:`, error.message);
    }
    
    // Wait a bit between requests to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  console.log('\n\n=== Cached Sources ===');
  const cached = etherscan.getCachedSources();
  console.log(`Total cached contracts: ${Object.keys(cached).length}`);
}

// Run example
if (require.main === module) {
  example().catch(console.error);
}

module.exports = { example };
