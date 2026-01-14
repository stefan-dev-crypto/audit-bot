/**
 * Etherscan API client module
 * Handles fetching contract source code and other contract information
 */

/**
 * Fetch contract source code from Etherscan
 * @param {string} contractAddress - The contract address to fetch
 * @param {Object} chainConfig - Chain configuration object
 * @returns {Promise<Object>} Contract source code and metadata
 */
export async function fetchContractSource(contractAddress, chainConfig) {
  const { explorerApiUrl, explorerApiKey, chainId } = chainConfig;
  
  const url = `${explorerApiUrl}?apikey=${explorerApiKey}&chainid=${chainId}&module=contract&action=getsourcecode&address=${contractAddress}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status !== '1') {
      throw new Error(`Etherscan API error: ${data.message}`);
    }
    
    const result = data.result[0];
    
    // Check if contract is verified
    if (!result.SourceCode) {
      return {
        address: contractAddress,
        verified: false,
        message: 'Contract source code not verified on Etherscan',
      };
    }
    
    return {
      address: contractAddress,
      verified: true,
      sourceCode: result.SourceCode,
      abi: result.ABI,
      contractName: result.ContractName,
      compilerVersion: result.CompilerVersion,
      optimizationUsed: result.OptimizationUsed,
      runs: result.Runs,
      constructorArguments: result.ConstructorArguments,
      evmVersion: result.EVMVersion,
      library: result.Library,
      licenseType: result.LicenseType,
      proxy: result.Proxy,
      implementation: result.Implementation,
      swarmSource: result.SwarmSource,
    };
  } catch (error) {
    console.error(`Error fetching contract source for ${contractAddress}:`, error.message);
    throw error;
  }
}

/**
 * Check if an address is a contract
 * @param {string} address - The address to check
 * @param {Object} provider - Ethers provider instance
 * @returns {Promise<boolean>} True if address is a contract
 */
export async function isContract(address, provider) {
  try {
    const code = await provider.getCode(address);
    // If code is '0x' or '0x0', it's an EOA (Externally Owned Account), not a contract
    return code !== '0x' && code !== '0x0';
  } catch (error) {
    console.error(`Error checking if address is contract: ${address}`, error.message);
    return false;
  }
}
