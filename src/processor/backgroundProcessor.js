/**
 * Background processor module
 * Combines fetching and auditing in one process to save disk space
 */

import fs from 'fs';
import path from 'path';
import { fetchContractSource } from '../api/etherscan.js';
import { OpenAIAuditor } from '../audit/openaiAuditor.js';
import { detectContractLanguage, cleanPragmaStatements } from '../utils/contractValidator.js';
import { optimizeForAudit } from '../utils/contractOptimizer.js';
import { SETTINGS } from '../config/settings.js';

export class BackgroundProcessor {
  constructor(dataDir = './data', chainConfig, statistics = null) {
    this.dataDir = dataDir;
    this.chainConfig = chainConfig;
    this.statistics = statistics;
    this.processedContractsFile = path.join(dataDir, 'processed-contracts.json');
    this.tempDir = path.join(dataDir, 'temp');
    this.auditor = new OpenAIAuditor(process.env.OPENAI_API_KEY, statistics);
    this.isRunning = false;
    this.checkInterval = SETTINGS.FETCHER_CHECK_INTERVAL;
    this.processDelay = SETTINGS.OPENAI_AUDIT_DELAY; // Slower delay since we're doing both
    this.currentlyProcessing = null;
    this.contractIndex = 1;
    
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
   * Check for unprocessed contracts and process them
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
      address => !this.auditor.isAudited(address)
    );

    if (unauditedContracts.length === 0) {
      return;
    }

    // Process contracts one by one
    for (const contractAddress of unauditedContracts) {
      if (!this.isRunning) break;

      // Skip if currently processing this contract
      if (this.currentlyProcessing === contractAddress) {
        continue;
      }

      await this.processContract(contractAddress);

      // Rate limiting delay
      await this.sleep(this.processDelay);
    }
  }

  /**
   * Process a single contract: fetch then audit
   */
  async processContract(contractAddress) {
    this.currentlyProcessing = contractAddress;

    try {
      console.log(`\n🔄 [Processor] Processing: ${contractAddress}`);
      
      // Step 1: Fetch from Etherscan
      console.log(`   📥 Fetching from Etherscan...`);
      const contractData = await fetchContractSource(contractAddress, this.chainConfig);

      if (!contractData.verified) {
        console.log(`   ⚠️  Not verified on Etherscan`);
        // Mark as audited to avoid retrying
        this.auditor.recordAuditResult(contractAddress, false, [], false, null);
        return;
      }

      // Step 2: Process and optimize contract source
      console.log(`   ⚙️  Processing contract source...`);
      const sourceContent = this.processContractSource(contractAddress, contractData);
      
      if (!sourceContent) {
        console.log(`   ⏭️  Skipped: Non-Solidity or invalid contract`);
        this.auditor.recordAuditResult(contractAddress, false, [], false, null);
        return;
      }

      // Step 3: Save to temporary file
      const tempFilePath = path.join(this.tempDir, `${this.contractIndex}_${contractAddress.toLowerCase()}.sol`);
      fs.writeFileSync(tempFilePath, sourceContent, 'utf8');
      this.contractIndex++;

      // Step 4: Audit with OpenAI
      console.log(`   🤖 Auditing with OpenAI...`);
      const auditResult = await this.auditor.auditContract(contractAddress, tempFilePath);

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
      
      // Record as failed audit
      this.auditor.recordAuditResult(contractAddress, false, [], true, error.message);
      
      // If rate limited, wait longer
      if (error.message.includes('Rate limit') || error.message.includes('429')) {
        console.log(`   ⏸️  Rate limited - waiting ${SETTINGS.OPENAI_RATE_LIMIT_WAIT / 1000}s...`);
        await this.sleep(SETTINGS.OPENAI_RATE_LIMIT_WAIT);
      }
    } finally {
      this.currentlyProcessing = null;
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
