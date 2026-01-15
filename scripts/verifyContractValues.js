/**
 * Verify that all contracts in processed-contracts.json meet the $10000 threshold
 * This script re-checks all recorded contracts and reports those below threshold
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import { getChainConfig } from '../src/config/chains.js';
import { fetchTokenPrices, getTokenBalance, calculateContractValue, getDexScreenerChainId } from '../src/utils/tokenValueCalculator.js';

async function verifyContractValues() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║        Verifying Contract Value Thresholds                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  const MIN_VALUE_USD = 10000;
  const chainName = process.env.CHAIN || 'ethereum';
  
  try {
    // Get chain configuration
    const chainConfig = getChainConfig(chainName);
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const dexScreenerChainId = getDexScreenerChainId(chainConfig.chainId);
    
    console.log(`Chain: ${chainConfig.name}`);
    console.log(`Threshold: $${MIN_VALUE_USD}\n`);
    
    // Load processed contracts
    const processedContractsFile = path.join(process.cwd(), 'data', 'processed-contracts.json');
    
    if (!fs.existsSync(processedContractsFile)) {
      console.log('No processed-contracts.json file found.\n');
      return;
    }
    
    const data = fs.readFileSync(processedContractsFile, 'utf8');
    const processedContracts = JSON.parse(data);
    
    console.log(`Total contracts in file: ${processedContracts.length}\n`);
    
    // Convert to array of objects if old format
    const contractPairs = processedContracts.map(item => {
      if (typeof item === 'string') {
        return { contractAddress: item, tokenAddress: null };
      }
      return item;
    });
    
    // Filter out contracts without token addresses
    const validPairs = contractPairs.filter(pair => pair.tokenAddress);
    
    console.log(`Contracts with token addresses: ${validPairs.length}`);
    console.log(`Contracts without token addresses: ${contractPairs.length - validPairs.length}\n`);
    
    if (validPairs.length === 0) {
      console.log('No contracts with token addresses to verify.\n');
      return;
    }
    
    // Process in batches of 30
    const batchSize = 30;
    let totalChecked = 0;
    let belowThreshold = [];
    let zeroBalance = [];
    let noPriceData = [];
    let errors = [];
    
    for (let i = 0; i < validPairs.length; i += batchSize) {
      const batch = validPairs.slice(i, i + batchSize);
      console.log(`\n💰 Checking batch ${Math.floor(i / batchSize) + 1} (${batch.length} contracts)...`);
      
      // Extract unique token addresses
      const uniqueTokens = [...new Set(batch.map(item => item.tokenAddress.toLowerCase()))];
      
      // Fetch token prices
      console.log(`   📊 Fetching prices for ${uniqueTokens.length} token(s)...`);
      const priceMap = await fetchTokenPrices(dexScreenerChainId, uniqueTokens);
      
      // Check each contract
      for (const pair of batch) {
        totalChecked++;
        const tokenAddressLower = pair.tokenAddress.toLowerCase();
        
        // Check if price data exists
        if (!priceMap[tokenAddressLower]) {
          noPriceData.push(pair);
          console.log(`   ⚠️  ${pair.contractAddress}: No price data`);
          continue;
        }
        
        const tokenInfo = priceMap[tokenAddressLower];
        const tokenPrice = tokenInfo.price;
        
        if (!tokenPrice || tokenPrice <= 0) {
          noPriceData.push(pair);
          console.log(`   ⚠️  ${pair.contractAddress}: Invalid price ($${tokenPrice})`);
          continue;
        }
        
        // Get balance
        const balanceInfo = await getTokenBalance(pair.tokenAddress, pair.contractAddress, provider);
        
        if (!balanceInfo) {
          errors.push({ ...pair, error: 'Failed to get balance' });
          console.log(`   ❌ ${pair.contractAddress}: Failed to get balance`);
          continue;
        }
        
        if (balanceInfo.balance === '0') {
          zeroBalance.push(pair);
          console.log(`   ⚠️  ${pair.contractAddress}: Zero balance in ${tokenInfo.symbol}`);
          continue;
        }
        
        // Calculate value
        const value = calculateContractValue(balanceInfo.balance, balanceInfo.decimals, tokenPrice);
        
        if (isNaN(value) || value === null || value === undefined) {
          errors.push({ ...pair, error: 'Invalid calculated value' });
          console.log(`   ❌ ${pair.contractAddress}: Invalid value`);
          continue;
        }
        
        // Check against threshold
        if (value < MIN_VALUE_USD) {
          belowThreshold.push({ ...pair, value, tokenSymbol: tokenInfo.symbol });
          console.log(`   ⚠️  ${pair.contractAddress}: $${value.toFixed(2)} in ${tokenInfo.symbol} (BELOW THRESHOLD)`);
        } else {
          console.log(`   ✅ ${pair.contractAddress}: $${value.toFixed(2)} in ${tokenInfo.symbol}`);
        }
      }
      
      // Small delay between batches
      if (i + batchSize < validPairs.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Print summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    Verification Summary                       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    console.log(`Total contracts checked: ${totalChecked}`);
    console.log(`✅ Contracts meeting threshold (≥$${MIN_VALUE_USD}): ${totalChecked - belowThreshold.length - zeroBalance.length - noPriceData.length - errors.length}`);
    console.log(`⚠️  Contracts below threshold: ${belowThreshold.length}`);
    console.log(`⚠️  Contracts with zero balance: ${zeroBalance.length}`);
    console.log(`⚠️  Contracts with no price data: ${noPriceData.length}`);
    console.log(`❌ Contracts with errors: ${errors.length}\n`);
    
    if (belowThreshold.length > 0) {
      console.log('════════════════════════════════════════════════════════════════');
      console.log(`CONTRACTS BELOW $${MIN_VALUE_USD} THRESHOLD:`);
      console.log('════════════════════════════════════════════════════════════════');
      belowThreshold.forEach((item, idx) => {
        console.log(`${idx + 1}. ${item.contractAddress}: $${item.value.toFixed(2)} in ${item.tokenSymbol}`);
      });
      console.log('');
    }
    
    if (zeroBalance.length > 0) {
      console.log('════════════════════════════════════════════════════════════════');
      console.log('CONTRACTS WITH ZERO BALANCE:');
      console.log('════════════════════════════════════════════════════════════════');
      zeroBalance.slice(0, 20).forEach((item, idx) => {
        console.log(`${idx + 1}. ${item.contractAddress} (Token: ${item.tokenAddress})`);
      });
      if (zeroBalance.length > 20) {
        console.log(`... and ${zeroBalance.length - 20} more`);
      }
      console.log('');
    }
    
    console.log('✅ Verification complete!\n');
    
  } catch (error) {
    console.error('\n❌ Verification error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

verifyContractValues();
