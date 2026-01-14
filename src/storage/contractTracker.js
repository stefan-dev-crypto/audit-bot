/**
 * Contract tracker module
 * Tracks processed contracts to avoid duplicate fetches
 */

import fs from 'fs';
import path from 'path';
import { OpenAIAuditor } from '../audit/openaiAuditor.js';
import { AuditStatistics } from './auditStatistics.js';

export class ContractTracker {
  constructor(dataDir = './data', statistics = null) {
    this.dataDir = dataDir;
    this.processedContracts = new Set();
    this.contractsFilePath = path.join(dataDir, 'processed-contracts.json');
    this.sourcesDir = path.join(dataDir, 'sources');
    this.contractIndex = 0;
    this.statistics = statistics || new AuditStatistics(dataDir);
    
    // Initialize OpenAI auditor
    this.auditor = new OpenAIAuditor(process.env.OPENAI_API_KEY, this.statistics);
    
    this.initialize();
  }
  
  /**
   * Initialize the tracker and load existing data
   */
  initialize() {
    // Create data directories if they don't exist
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    
    if (!fs.existsSync(this.sourcesDir)) {
      fs.mkdirSync(this.sourcesDir, { recursive: true });
    }
    
    // Load processed contracts from file
    this.loadProcessedContracts();
    
    // Calculate next index based on existing files
    this.calculateNextIndex();
  }
  
  /**
   * Calculate the next index for file naming
   */
  calculateNextIndex() {
    try {
      const files = fs.readdirSync(this.sourcesDir);
      const solFiles = files.filter(f => f.endsWith('.sol'));
      
      if (solFiles.length === 0) {
        this.contractIndex = 1;
        return;
      }
      
      // Extract indices from existing files
      const indices = solFiles
        .map(f => {
          const match = f.match(/^(\d+)_/);
          return match ? parseInt(match[1]) : 0;
        })
        .filter(n => !isNaN(n));
      
      this.contractIndex = indices.length > 0 ? Math.max(...indices) + 1 : 1;
    } catch (error) {
      this.contractIndex = 1;
    }
  }
  
  /**
   * Load processed contracts from storage (including split files)
   */
  loadProcessedContracts() {
    try {
      this.processedContracts = new Set();
      
      // Load main file
      if (fs.existsSync(this.contractsFilePath)) {
        const data = fs.readFileSync(this.contractsFilePath, 'utf8');
        const contracts = JSON.parse(data);
        contracts.forEach(addr => this.processedContracts.add(addr));
      }
      
      // Load split files if they exist (processed-contracts-1.json, etc.)
      if (fs.existsSync(this.dataDir)) {
        const files = fs.readdirSync(this.dataDir);
        const splitFiles = files.filter(f => f.match(/^processed-contracts-\d+\.json$/));
        
        for (const file of splitFiles) {
          const filePath = path.join(this.dataDir, file);
          const data = fs.readFileSync(filePath, 'utf8');
          const contracts = JSON.parse(data);
          contracts.forEach(addr => this.processedContracts.add(addr));
        }
      }
      
      if (this.processedContracts.size > 0) {
        console.log(`Loaded ${this.processedContracts.size} previously processed contracts`);
      }
    } catch (error) {
      console.error('Error loading processed contracts:', error.message);
      this.processedContracts = new Set();
    }
  }
  
  /**
   * Save processed contracts to storage (splits into multiple files if > 5MB)
   */
  saveProcessedContracts() {
    try {
      const contracts = Array.from(this.processedContracts);
      const jsonString = JSON.stringify(contracts, null, 2);
      const fileSize = Buffer.byteLength(jsonString, 'utf8');
      const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
      
      if (fileSize > MAX_FILE_SIZE) {
        // Split into multiple files
        const chunkSize = Math.ceil(contracts.length / Math.ceil(fileSize / MAX_FILE_SIZE));
        
        for (let i = 0; i < contracts.length; i += chunkSize) {
          const chunk = contracts.slice(i, i + chunkSize);
          const chunkIndex = Math.floor(i / chunkSize);
          const chunkFile = chunkIndex === 0
            ? this.contractsFilePath
            : path.join(this.dataDir, `processed-contracts-${chunkIndex}.json`);
          
          fs.writeFileSync(chunkFile, JSON.stringify(chunk, null, 2), 'utf8');
        }
        console.log(`Split processed contracts into ${Math.ceil(contracts.length / chunkSize)} files`);
      } else {
        // Save as single file
        fs.writeFileSync(this.contractsFilePath, jsonString, 'utf8');
      }
    } catch (error) {
      console.error('Error saving processed contracts:', error.message);
    }
  }
  
  /**
   * Check if a contract has been processed
   * @param {string} address - Contract address
   * @returns {boolean} True if already processed
   */
  isProcessed(address) {
    const normalizedAddress = address.toLowerCase();
    return this.processedContracts.has(normalizedAddress);
  }
  
  /**
   * Mark a contract as processed
   * @param {string} address - Contract address
   */
  markAsProcessed(address) {
    const normalizedAddress = address.toLowerCase();
    
    // Only increment if it's a new contract
    if (!this.processedContracts.has(normalizedAddress)) {
      this.statistics.incrementFetched();
    }
    
    this.processedContracts.add(normalizedAddress);
    this.saveProcessedContracts();
  }
  
  /**
   * Save contract source code as a single flattened .sol file
   * Format: {index}_{contractaddress}.sol
   * @param {string} address - Contract address
   * @param {Object} contractData - Contract source data
   * @returns {string|null} Path to saved file or null if error
   */
  saveContractSource(address, contractData) {
    try {
      const fileName = `${this.contractIndex}_${address.toLowerCase()}.sol`;
      const filePath = path.join(this.sourcesDir, fileName);
      
      // Build the flattened source code
      let flattenedSource = '';
      
      // Add header comment with contract information
      flattenedSource += `// Contract Address: ${contractData.address}\n`;
      flattenedSource += `// Contract Name: ${contractData.contractName || 'Unknown'}\n`;
      flattenedSource += `// Compiler: ${contractData.compilerVersion || 'Unknown'}\n`;
      flattenedSource += `// Optimization: ${contractData.optimizationUsed === '1' ? 'Enabled' : 'Disabled'}`;
      if (contractData.runs) {
        flattenedSource += ` (${contractData.runs} runs)`;
      }
      flattenedSource += `\n`;
      flattenedSource += `// License: ${contractData.licenseType || 'None'}\n`;
      if (contractData.proxy === '1' && contractData.implementation) {
        flattenedSource += `// Proxy Implementation: ${contractData.implementation}\n`;
      }
      flattenedSource += `// Etherscan: https://etherscan.io/address/${contractData.address}#code\n`;
      flattenedSource += `\n`;
      
      let sourceCode = contractData.sourceCode;
      
      // Check if it's a multi-file source (JSON format)
      if (sourceCode.startsWith('{')) {
        try {
          // Handle double-brace wrapping from Etherscan (Standard JSON Input format)
          // Sometimes Etherscan returns: {{ "language": "Solidity", ... }}
          if (sourceCode.startsWith('{{') && sourceCode.endsWith('}}')) {
            // Remove outer braces
            sourceCode = sourceCode.slice(1, -1);
          }
          
          // Try to parse as JSON (multi-file contract)
          let parsed = JSON.parse(sourceCode);
          
          let sources = {};
          
          // Handle Standard JSON Input format
          if (parsed.language && parsed.sources) {
            // Standard JSON format: { language: "Solidity", sources: {...}, settings: {...} }
            sources = parsed.sources;
          } else if (parsed.sources) {
            // Wrapped format: { sources: {...} }
            sources = parsed.sources;
          } else {
            // Direct file mapping: { "file1.sol": {...}, "file2.sol": {...} }
            sources = parsed;
          }
          
          // Flatten all files into one
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
          // If JSON parsing fails, use as-is
          flattenedSource += sourceCode;
        }
      } else {
        // Single file contract - use directly
        flattenedSource += sourceCode;
      }
      
      // Write the flattened file
      fs.writeFileSync(filePath, flattenedSource, 'utf8');
      
      // File saved silently (address already logged)
      
      // Increment index for next contract
      this.contractIndex++;
      
      return filePath;
      
    } catch (error) {
      console.error(`Error saving contract source for ${address}:`, error.message);
      return null;
    }
  }
  
  /**
   * Audit a contract using OpenAI (deprecated - use BackgroundAuditor instead)
   * This method is kept for backward compatibility but auditing should happen in parallel
   * @param {string} address - Contract address
   * @param {string} sourceFilePath - Path to the contract source file
   * @returns {Promise<Object>} Audit result
   */
  async auditContract(address, sourceFilePath) {
    console.warn('⚠️  Direct auditing is deprecated. Use BackgroundAuditor for parallel auditing.');
    return await this.auditor.auditContract(address, sourceFilePath);
  }
  
  /**
   * Get statistics about processed contracts
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      totalProcessed: this.processedContracts.size,
      contracts: Array.from(this.processedContracts),
    };
  }
}
