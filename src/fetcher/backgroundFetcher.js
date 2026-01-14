/**
 * Background fetcher module
 * Fetches contract source code from Etherscan in parallel with event detection
 */

import fs from 'fs';
import path from 'path';
import { fetchContractSource } from '../api/etherscan.js';
import { detectContractLanguage, cleanPragmaStatements } from '../utils/contractValidator.js';
import { optimizeForAudit } from '../utils/contractOptimizer.js';

export class BackgroundFetcher {
  constructor(dataDir = './data', chainConfig) {
    this.dataDir = dataDir;
    this.chainConfig = chainConfig;
    this.fetchedContractsFile = path.join(dataDir, 'fetched-contracts.json');
    this.processedContractsFile = path.join(dataDir, 'processed-contracts.json');
    this.sourcesDir = path.join(dataDir, 'sources');
    this.fetchedContracts = new Set();
    this.contractIndex = 0;
    this.isRunning = false;
    this.checkInterval = 5000; // Check every 5 seconds
    this.fetchDelay = 200; // 200ms = 5 calls per second max
    this.currentlyFetching = null;
    
    this.loadFetchedContracts();
    this.loadContractIndex();
  }

  /**
   * Load fetched contracts from JSON file
   */
  loadFetchedContracts() {
    try {
      if (!fs.existsSync(this.fetchedContractsFile)) {
        fs.writeFileSync(this.fetchedContractsFile, JSON.stringify([]), 'utf8');
        return;
      }

      const data = fs.readFileSync(this.fetchedContractsFile, 'utf8');
      const contracts = JSON.parse(data);
      
      if (Array.isArray(contracts)) {
        this.fetchedContracts = new Set(contracts);
      }
      
      console.log(`📋 Loaded ${this.fetchedContracts.size} previously fetched contracts`);
    } catch (error) {
      console.error('Error loading fetched contracts:', error.message);
      this.fetchedContracts = new Set();
    }
  }

  /**
   * Save fetched contracts to JSON file
   */
  saveFetchedContracts() {
    try {
      const contracts = Array.from(this.fetchedContracts);
      fs.writeFileSync(this.fetchedContractsFile, JSON.stringify(contracts, null, 2), 'utf8');
    } catch (error) {
      console.error('Error saving fetched contracts:', error.message);
    }
  }

  /**
   * Load the current contract index from existing files
   */
  loadContractIndex() {
    try {
      if (!fs.existsSync(this.sourcesDir)) {
        fs.mkdirSync(this.sourcesDir, { recursive: true });
        this.contractIndex = 1;
        return;
      }

      const files = fs.readdirSync(this.sourcesDir);
      const indices = files
        .map(file => {
          const match = file.match(/^(\d+)_/);
          return match ? parseInt(match[1]) : 0;
        })
        .filter(index => index > 0);

      this.contractIndex = indices.length > 0 ? Math.max(...indices) + 1 : 1;
    } catch (error) {
      console.error('Error loading contract index:', error.message);
      this.contractIndex = 1;
    }
  }

  /**
   * Check if contract has been fetched
   */
  isFetched(address) {
    return this.fetchedContracts.has(address.toLowerCase());
  }

  /**
   * Mark contract as fetched
   */
  markAsFetched(address) {
    this.fetchedContracts.add(address.toLowerCase());
    this.saveFetchedContracts();
  }

  /**
   * Start the background fetcher
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️  Background fetcher already running');
      return;
    }

    this.isRunning = true;
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║         Background Fetcher Started (Parallel Mode)            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log(`✅ Checking for unfetched contracts every ${this.checkInterval / 1000}s`);
    console.log(`⏱️  Delay between fetches: ${this.fetchDelay}ms (5/sec max)\n`);

    // Start the continuous fetch loop
    this.fetchLoop();
  }

  /**
   * Stop the background fetcher
   */
  stop() {
    this.isRunning = false;
    console.log('\n🛑 Background fetcher stopped');
  }

  /**
   * Continuous loop that checks for and fetches contracts
   */
  async fetchLoop() {
    while (this.isRunning) {
      try {
        await this.checkAndFetchContracts();
      } catch (error) {
        console.error('❌ Error in fetch loop:', error.message);
      }

      // Wait before next check
      await this.sleep(this.checkInterval);
    }
  }

  /**
   * Check for unfetched contracts and fetch them
   */
  async checkAndFetchContracts() {
    // Load processed contracts
    if (!fs.existsSync(this.processedContractsFile)) {
      return;
    }

    let processedContracts = [];
    try {
      const data = fs.readFileSync(this.processedContractsFile, 'utf8');
      processedContracts = JSON.parse(data);
    } catch (error) {
      console.error('Error loading processed contracts:', error.message);
      return;
    }

    // Find unfetched contracts
    const unfetchedContracts = processedContracts.filter(
      address => !this.isFetched(address)
    );

    if (unfetchedContracts.length === 0) {
      return;
    }

    // Fetch contracts one by one
    for (const contractAddress of unfetchedContracts) {
      if (!this.isRunning) break;

      // Skip if currently fetching this contract
      if (this.currentlyFetching === contractAddress) {
        continue;
      }

      await this.fetchContract(contractAddress);

      // Rate limiting delay (5 calls per second)
      await this.sleep(this.fetchDelay);
    }
  }

  /**
   * Fetch a single contract
   */
  async fetchContract(contractAddress) {
    this.currentlyFetching = contractAddress;

    try {
      console.log(`\n🔍 [Fetcher] Fetching: ${contractAddress}`);
      
      const contractData = await fetchContractSource(contractAddress, this.chainConfig);

      if (!contractData.verified) {
        console.log(`   ⚠️  Not verified on Etherscan`);
        this.markAsFetched(contractAddress);
        return;
      }

      // Save contract source
      const sourceFilePath = this.saveContractSource(contractAddress, contractData);
      
      if (sourceFilePath) {
        console.log(`   ✅ Fetched: ${contractData.contractName} | Saved to ${path.basename(sourceFilePath)}`);
      }

      this.markAsFetched(contractAddress);

    } catch (error) {
      console.error(`   ❌ Fetch failed: ${error.message}`);
      
      // Mark as fetched even on error to avoid infinite retries
      // (will still have it in processed-contracts.json)
      this.markAsFetched(contractAddress);
    } finally {
      this.currentlyFetching = null;
    }
  }

  /**
   * Save contract source to file
   */
  saveContractSource(address, contractData) {
    try {
      const fileName = `${this.contractIndex}_${address.toLowerCase()}.sol`;
      const filePath = path.join(this.sourcesDir, fileName);
      
      let flattenedSource = '';
      
      // Add header
      flattenedSource += `// Contract: ${contractData.contractName}\n`;
      flattenedSource += `// Address: ${address}\n`;
      flattenedSource += `// Compiler: ${contractData.compilerVersion}\n`;
      if (contractData.proxy === '1' && contractData.implementation) {
        flattenedSource += `// Proxy Implementation: ${contractData.implementation}\n`;
      }
      flattenedSource += `// Fetched: ${new Date().toISOString()}\n`;
      flattenedSource += `// ================================================================\n\n`;
      
      let sourceCode = contractData.sourceCode;
      
      // Handle Etherscan's double-brace wrapper
      if (sourceCode.startsWith('{{') && sourceCode.endsWith('}}')) {
        sourceCode = sourceCode.slice(1, -1);
      }

      // Handle JSON format
      if (sourceCode.startsWith('{')) {
        try {
          let parsed = JSON.parse(sourceCode);
          let sources = {};
          
          if (parsed.language && parsed.sources) {
            sources = parsed.sources;
          } else if (parsed.sources) {
            sources = parsed.sources;
          } else {
            sources = parsed;
          }
          
          for (const [fileName, fileData] of Object.entries(sources)) {
            let content = '';
            if (typeof fileData === 'string') {
              content = fileData;
            } else if (fileData && fileData.content) {
              content = fileData.content;
            }
            
            if (content) {
              flattenedSource += `// File: ${fileName}\n`;
              flattenedSource += `// ================================================================\n\n`;
              flattenedSource += content;
              flattenedSource += `\n\n`;
            }
          }
        } catch (parseError) {
          flattenedSource += sourceCode;
        }
      } else {
        flattenedSource += sourceCode;
      }

      // Validate and optimize
      const language = detectContractLanguage(flattenedSource);
      if (language !== 'Solidity') {
        console.log(`   ⏭️  Skipped: ${language} contract (not Solidity)`);
        return null;
      }
      flattenedSource = cleanPragmaStatements(flattenedSource);
      
      // Optimize
      const optimization = optimizeForAudit(flattenedSource, 20000);
      
      // Write file
      fs.writeFileSync(filePath, optimization.optimized, 'utf8');
      
      // Log optimization if significant
      if (optimization.originalTokens > 20000) {
        console.log(`   📄 Optimized: ${fileName} | ${optimization.originalTokens} → ${optimization.optimizedTokens} tokens (-${optimization.reductionPercent}%)`);
      }
      
      this.contractIndex++;
      return filePath;
      
    } catch (error) {
      console.error(`   ❌ Error saving contract source:`, error.message);
      return null;
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalFetched: this.fetchedContracts.size,
    };
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
