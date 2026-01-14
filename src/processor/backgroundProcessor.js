/**
 * Background processor module
 * Combines fetching and auditing in one process to save disk space
 */

import fs from 'fs';
import path from 'path';
import { fetchContractSource } from '../api/etherscan.js';
import { AuditorPool } from '../audit/auditorPool.js';
import { detectContractLanguage, cleanPragmaStatements } from '../utils/contractValidator.js';
import { optimizeForAudit } from '../utils/contractOptimizer.js';
import { SETTINGS } from '../config/settings.js';
import { getOpenAIKeys, getTelegramConfig } from '../config/apiKeys.js';

export class BackgroundProcessor {
  constructor(dataDir = './data', chainConfig, statistics = null) {
    this.dataDir = dataDir;
    this.chainConfig = chainConfig;
    this.statistics = statistics;
    this.processedContractsFile = path.join(dataDir, 'processed-contracts.json');
    this.tempDir = path.join(dataDir, 'temp');
    
    // Initialize auditor pool with multiple API keys for parallel processing
    const apiKeys = getOpenAIKeys();
    const telegramConfig = getTelegramConfig();
    this.auditorPool = new AuditorPool(apiKeys, telegramConfig);
    
    this.isRunning = false;
    this.checkInterval = SETTINGS.FETCHER_CHECK_INTERVAL;
    this.processDelay = 2000; // Reduced delay since we have parallel auditors
    this.currentlyProcessing = [];
    this.contractIndex = 1;
    this.maxConcurrentProcessing = apiKeys.length; // Process as many as we have auditors
    
    this.initialize();
  }

  /**
   * Initialize temp directory
   */
  initialize() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Start the background processor
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️  Background processor already running');
      return;
    }

    this.isRunning = true;
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║      Background Processor Started (Fetch + Audit Mode)        ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log(`✅ Checking for unprocessed contracts every ${this.checkInterval / 1000}s`);
    console.log(`⏱️  Delay between processes: ${this.processDelay / 1000}s\n`);

    // Start the continuous process loop
    this.processLoop();
  }

  /**
   * Stop the background processor
   */
  stop() {
    this.isRunning = false;
    console.log('\n🛑 Background processor stopped');
  }

  /**
   * Continuous loop that processes contracts
   */
  async processLoop() {
    while (this.isRunning) {
      try {
        await this.checkAndProcessContracts();
      } catch (error) {
        console.error('❌ Error in process loop:', error.message);
      }

      // Wait before next check
      await this.sleep(this.checkInterval);
    }
  }

  /**
   * Check for unprocessed contracts and process them (in parallel)
   */
  async checkAndProcessContracts() {
    // Load processed contracts (detected addresses)
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

    // Find contracts that haven't been audited yet
    const unauditedContracts = processedContracts.filter(
      address => !this.auditorPool.isAudited(address) && !this.currentlyProcessing.includes(address)
    );

    if (unauditedContracts.length === 0) {
      return;
    }

    // Process multiple contracts in parallel (up to maxConcurrentProcessing)
    const processingPromises = [];
    const contractsToProcess = unauditedContracts.slice(0, this.maxConcurrentProcessing - this.currentlyProcessing.length);
    
    for (const contractAddress of contractsToProcess) {
      if (!this.isRunning) break;

      // Start processing in parallel (don't await)
      const promise = this.processContract(contractAddress)
        .catch(error => {
          console.error(`❌ Processing error for ${contractAddress}:`, error.message);
        });
      
      processingPromises.push(promise);
      
      // Small delay to stagger the starts
      await this.sleep(500);
    }

    // Wait for all processing to complete
    if (processingPromises.length > 0) {
      await Promise.allSettled(processingPromises);
    }
  }

  /**
   * Process a single contract: fetch then audit
   */
  async processContract(contractAddress) {
    // Add to currently processing list
    this.currentlyProcessing.push(contractAddress);

    try {
      console.log(`\n🔄 [Processor] Processing: ${contractAddress}`);
      
      // Step 1: Fetch from Etherscan
      console.log(`   📥 Fetching from Etherscan...`);
      const contractData = await fetchContractSource(contractAddress, this.chainConfig);

      if (!contractData.verified) {
        console.log(`   ⚠️  Not verified on Etherscan`);
        // Mark as audited to avoid retrying (using first auditor for recording)
        this.auditorPool.auditors[0].auditor.recordAuditResult(contractAddress, false, [], false, null);
        return;
      }

      // Step 2: Process and optimize contract source
      console.log(`   ⚙️  Processing contract source...`);
      const sourceContent = this.processContractSource(contractAddress, contractData);
      
      if (!sourceContent) {
        console.log(`   ⏭️  Skipped: Non-Solidity or invalid contract`);
        this.auditorPool.auditors[0].auditor.recordAuditResult(contractAddress, false, [], false, null);
        return;
      }

      // Step 3: Save to temporary file
      const tempFilePath = path.join(this.tempDir, `${this.contractIndex}_${contractAddress.toLowerCase()}.sol`);
      fs.writeFileSync(tempFilePath, sourceContent, 'utf8');
      this.contractIndex++;

      // Step 4: Audit with OpenAI (using auditor pool for parallel processing)
      console.log(`   🤖 Auditing with OpenAI (parallel)...`);
      const auditResult = await this.auditorPool.auditContract(contractAddress, tempFilePath);

      // Step 5: Delete temporary file
      try {
        fs.unlinkSync(tempFilePath);
      } catch (deleteError) {
        // Ignore deletion errors
      }

      // Step 6: Log results
      if (auditResult.hasVulnerabilities) {
        console.log(`   🚨 VULNERABLE! | ${auditResult.criticalIssuesCount} issue(s): ${auditResult.vulnerabilityNames?.join(', ')}`);
      } else if (!auditResult.failed) {
        console.log(`   ✅ Clean contract`);
      }

    } catch (error) {
      console.error(`   ❌ Process failed: ${error.message}`);
      
      // Record as failed audit (using first auditor for recording)
      this.auditorPool.auditors[0].auditor.recordAuditResult(contractAddress, false, [], true, error.message);
      
      // If rate limited, wait longer (less common with parallel processing)
      if (error.message.includes('Rate limit') || error.message.includes('429')) {
        console.log(`   ⏸️  Rate limited - waiting ${SETTINGS.OPENAI_RATE_LIMIT_WAIT / 1000}s...`);
        await this.sleep(SETTINGS.OPENAI_RATE_LIMIT_WAIT);
      }
    } finally {
      // Remove from currently processing list
      const index = this.currentlyProcessing.indexOf(contractAddress);
      if (index > -1) {
        this.currentlyProcessing.splice(index, 1);
      }
    }
  }

  /**
   * Process contract source code
   */
  processContractSource(address, contractData) {
    try {
      let flattenedSource = '';
      
      // Add header
      flattenedSource += `// Contract: ${contractData.contractName}\n`;
      flattenedSource += `// Address: ${address}\n`;
      flattenedSource += `// Compiler: ${contractData.compilerVersion}\n`;
      if (contractData.proxy === '1' && contractData.implementation) {
        flattenedSource += `// Proxy Implementation: ${contractData.implementation}\n`;
      }
      flattenedSource += `// Processed: ${new Date().toISOString()}\n`;
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

      // Validate contract language
      const language = detectContractLanguage(flattenedSource);
      if (language !== 'Solidity') {
        return null;
      }
      
      // Clean pragma statements
      flattenedSource = cleanPragmaStatements(flattenedSource);
      
      // Optimize for audit
      const optimization = optimizeForAudit(flattenedSource, 20000);
      
      // Log optimization if significant
      if (optimization.originalTokens > 20000) {
        console.log(`   📄 Optimized: ${optimization.originalTokens} → ${optimization.optimizedTokens} tokens (-${optimization.reductionPercent}%)`);
      }
      
      return optimization.optimized;
      
    } catch (error) {
      console.error(`   ❌ Error processing source:`, error.message);
      return null;
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      currentlyProcessing: this.currentlyProcessing,
    };
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
