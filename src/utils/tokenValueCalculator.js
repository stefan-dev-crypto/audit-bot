/**
 * Token value calculator utility
 * Fetches token prices from DexScreener and calculates contract token holdings value
 */

import { ethers } from 'ethers';
import { ERC20_ABI } from '../config/erc20.js';

/**
 * Fetch token prices from DexScreener API
 * @param {string} chainId - Chain ID (e.g., 'ethereum')
 * @param {Array<string>} tokenAddresses - Array of token addresses (max 30)
 * @returns {Promise<Object>} Map of token address -> price USD
 */
export async function fetchTokenPrices(chainId, tokenAddresses) {
  if (!tokenAddresses || tokenAddresses.length === 0) {
    return {};
  }

  // DexScreener supports up to 30 tokens at once
  if (tokenAddresses.length > 30) {
    console.warn(`⚠️  Warning: DexScreener API supports max 30 tokens, got ${tokenAddresses.length}. Using first 30.`);
    tokenAddresses = tokenAddresses.slice(0, 30);
  }

  try {
    // Join token addresses with comma
    const addressesParam = tokenAddresses.join(',');
    const url = `https://api.dexscreener.com/tokens/v1/${chainId}/${addressesParam}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': '*/*'
      }
    });

    if (!response.ok) {
      throw new Error(`DexScreener API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Build price map: tokenAddress -> priceUsd
    const priceMap = {};
    
    if (data && Array.isArray(data)) {
      for (const pair of data) {
        if (pair.baseToken && pair.baseToken.address && pair.priceUsd) {
          const tokenAddress = pair.baseToken.address.toLowerCase();
          const priceUsd = parseFloat(pair.priceUsd);
          
          // Use the highest liquidity pair for each token
          if (!priceMap[tokenAddress] || (pair.liquidity?.usd > (priceMap[tokenAddress].liquidity || 0))) {
            priceMap[tokenAddress] = {
              price: priceUsd,
              liquidity: pair.liquidity?.usd || 0,
              symbol: pair.baseToken.symbol || 'UNKNOWN'
            };
          }
        }
      }
    }

    return priceMap;
  } catch (error) {
    console.error('Error fetching token prices from DexScreener:', error.message);
    return {};
  }
}

/**
 * Get token balance and decimals for a contract
 * @param {string} tokenAddress - ERC20 token address
 * @param {string} contractAddress - Contract address to check balance of
 * @param {Object} provider - Ethers provider
 * @returns {Promise<Object>} Object with balance and decimals
 */
export async function getTokenBalance(tokenAddress, contractAddress, provider) {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    
    // Get balance and decimals in parallel
    const [balance, decimals] = await Promise.all([
      tokenContract.balanceOf(contractAddress),
      tokenContract.decimals()
    ]);
    
    return {
      balance: balance.toString(),
      decimals: Number(decimals)
    };
  } catch (error) {
    console.error(`Error getting token balance for ${tokenAddress}:`, error.message);
    return null;
  }
}

/**
 * Calculate contract value in USD
 * @param {string} balance - Token balance (raw, not formatted)
 * @param {number} decimals - Token decimals
 * @param {number} priceUsd - Token price in USD
 * @returns {number} Contract value in USD
 */
export function calculateContractValue(balance, decimals, priceUsd) {
  try {
    // Convert balance to human-readable format
    const balanceFormatted = parseFloat(ethers.formatUnits(balance, decimals));
    
    // Calculate value: token price * token balance
    const value = priceUsd * balanceFormatted;
    
    return value;
  } catch (error) {
    console.error('Error calculating contract value:', error.message);
    return 0;
  }
}

/**
 * Filter contracts by token value threshold
 * Checks contracts that hold tokens and filters those with value >= threshold
 * @param {Array<Object>} contractTokenPairs - Array of {contractAddress, tokenAddress}
 * @param {number} minValueUsd - Minimum value threshold in USD
 * @param {string} chainId - Chain ID for DexScreener
 * @param {Object} provider - Ethers provider
 * @returns {Promise<Array<Object>>} Filtered contracts with value info
 */
export async function filterContractsByValue(contractTokenPairs, minValueUsd, chainId, provider) {
  if (!contractTokenPairs || contractTokenPairs.length === 0) {
    return [];
  }

  try {
    // Step 1: Extract unique token addresses (up to 30 for batch)
    const uniqueTokens = [...new Set(contractTokenPairs.map(pair => pair.tokenAddress.toLowerCase()))];
    const tokensToCheck = uniqueTokens.slice(0, 30);
    
    if (uniqueTokens.length > 30) {
      console.log(`⚠️  More than 30 unique tokens detected (${uniqueTokens.length}), processing first 30 in batch`);
    }

    console.log(`📊 Fetching prices for ${tokensToCheck.length} tokens from DexScreener...`);
    
    // Step 2: Fetch token prices from DexScreener (batch)
    const priceMap = await fetchTokenPrices(chainId, tokensToCheck);
    
    const foundPrices = Object.keys(priceMap).length;
    console.log(`💰 Found prices for ${foundPrices}/${tokensToCheck.length} tokens`);

    // Step 3: For each contract-token pair, get balance and calculate value
    const results = [];
    
    for (const pair of contractTokenPairs) {
      const tokenAddressLower = pair.tokenAddress.toLowerCase();
      
      // Skip if no price data available
      if (!priceMap[tokenAddressLower]) {
        console.log(`   ⏭️  No price data for token ${pair.tokenAddress}`);
        continue;
      }

      const tokenInfo = priceMap[tokenAddressLower];
      const tokenPrice = tokenInfo.price;
      
      // Get token balance and decimals
      const balanceInfo = await getTokenBalance(pair.tokenAddress, pair.contractAddress, provider);
      
      if (!balanceInfo) {
        continue;
      }

      // Calculate contract value
      const value = calculateContractValue(balanceInfo.balance, balanceInfo.decimals, tokenPrice);
      
      // Only include contracts meeting the minimum value threshold
      if (value >= minValueUsd) {
        results.push({
          contractAddress: pair.contractAddress,
          tokenAddress: pair.tokenAddress,
          tokenSymbol: tokenInfo.symbol,
          tokenPrice: tokenPrice,
          balance: balanceInfo.balance,
          decimals: balanceInfo.decimals,
          valueUsd: value
        });
        
        console.log(`   💎 Contract ${pair.contractAddress} holds $${value.toFixed(2)} in ${tokenInfo.symbol}`);
      } else {
        console.log(`   ⏭️  Contract ${pair.contractAddress} holds only $${value.toFixed(2)} in ${tokenInfo.symbol} (below $${minValueUsd} threshold)`);
      }
    }

    return results;
  } catch (error) {
    console.error('Error filtering contracts by value:', error.message);
    return [];
  }
}

/**
 * Get chain ID for DexScreener API
 * @param {number} chainId - Numeric chain ID
 * @returns {string} DexScreener chain ID
 */
export function getDexScreenerChainId(chainId) {
  const chainMap = {
    1: 'ethereum',
    56: 'bsc',
    8453: 'base',
    42161: 'arbitrum',
    137: 'polygon',
    10: 'optimism',
    43114: 'avalanche',
  };
  
  return chainMap[chainId] || 'ethereum';
}
