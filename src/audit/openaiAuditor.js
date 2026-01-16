import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { sendVulnerabilityAlert } from '../notifications/telegram.js';
import { SETTINGS } from '../config/settings.js';

/**
 * OpenAI Auditor
 * Audits contract source code using OpenAI API
 */
export class OpenAIAuditor {
  constructor(apiKey, telegramConfig = null) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
    
    this.auditResultsDir = path.join(process.cwd(), 'audit-results');
    this.auditedContractsFile = path.join(process.cwd(), 'data', 'audited-contracts.json');
    this.auditedContracts = new Set();
    this.auditingContracts = new Set(); // Track contracts currently being audited (prevents duplicate audits)
    this.auditResultIndex = 0; // Independent index for audit results, starting from 0
    
    // Telegram configuration
    this.telegramConfig = telegramConfig;
    
    this.systemPrompt = `You are a senior Solidity smart contract security auditor.
Your task is to identify ONLY the following vulnerability class:

"Arbitrary External Call via user-controlled target and/or calldata that allows draining all funds held by the contract."

You must:
- Focus exclusively on external calls (call, delegatecall, staticcall) where:
  - The call target is user-controlled OR
  - The calldata is user-controlled OR
  - Both are user-controlled
- Determine whether such calls can be abused to transfer ERC20 / ETH balances held by the contract
- Consider approval + call combinations as fund-draining vectors
- Assume a malicious caller with full control over function inputs

You must NOT:
- Report any other vulnerability classes (reentrancy, oracle manipulation, math errors, etc.)
- Report theoretical issues unless fund draining is realistically possible
- Suggest general best practices unless directly relevant to this vulnerability

Output must be precise, technical, and audit-grade.

    You need to return a JSON object with the following fields:
    - critical_vulnerability_exists: boolean
    - summary: string
    - critical_issues: array of objects
    - critical_issues_count: number

==================== OUTPUT RULE ====================
Return STRICT JSON ONLY.
No explanations outside JSON.`;

    this.userPrompt = `Audit the following Solidity contract.

    Focus ONLY on detecting the following vulnerability:

"Arbitrary External Call via user-controlled router / target / calldata that enables draining all funds held by the contract."

Ignore all other vulnerability types.

For any issue found:
- Identify the exact function and code snippet
- Explain how user input controls the external call
- Explain how contract-held funds (ERC20 or ETH) can be drained
- State clearly whether the issue is exploitable in practice

If no such vulnerability exists, explicitly state:
"NO Arbitrary External Call fund-drain vulnerability found."

==================== REQUIRED JSON FORMAT ====================
{
  "critical_vulnerability_exists": boolean,
  "summary": string,
  "critical_issues": array of objects with the following fields:
    - title: string
    - vulnerability_type: string
    - attack_scenario: string
    - impact: string
    - affected_contract: string
    - affected_function: string | string[]
    - affected_line_number: string | string[]
  "critical_issues_count": number,
}

==================== CONTRACT SOURCE CODE ====================
<PASTE SOLIDITY CODE HERE>`;
    
    this.initialize();
  }
  
  /**
   * Initialize the auditor
   */
  initialize() {
    // Create audit results directory if it doesn't exist
    if (!fs.existsSync(this.auditResultsDir)) {
      fs.mkdirSync(this.auditResultsDir, { recursive: true });
    }
    
    // Calculate next audit result index from existing files
    this.calculateNextAuditIndex();
    
    // Load previously audited contracts
    this.loadAuditedContracts();
  }
  
  /**
   * Calculate the next audit result index from existing files
   */
  calculateNextAuditIndex() {
    try {
      if (!fs.existsSync(this.auditResultsDir)) {
        this.auditResultIndex = 0;
        return;
      }

      const files = fs.readdirSync(this.auditResultsDir);
      const indices = files
        .filter(f => f.endsWith('_audit.txt'))
        .map(file => {
          // Extract index from filename (format: index_address_audit.txt)
          const match = file.match(/^(\d+)_/);
          return match ? parseInt(match[1]) : -1;
        })
        .filter(index => index >= 0);

      this.auditResultIndex = indices.length > 0 ? Math.max(...indices) + 1 : 0;
    } catch (error) {
      console.error('Error calculating audit result index:', error.message);
      this.auditResultIndex = 0;
    }
  }
  
  /**
   * Load audited contracts from storage (supports both old array and new object format)
   */
  loadAuditedContracts() {
    try {
      this.auditedContracts = new Set();
      
      // Load main file
      if (fs.existsSync(this.auditedContractsFile)) {
        const data = fs.readFileSync(this.auditedContractsFile, 'utf8');
        const auditedData = JSON.parse(data);
        
        // Support both old array format and new object format
        if (Array.isArray(auditedData)) {
          // Old format: ["0xaddr1", "0xaddr2"]
          auditedData.forEach(addr => this.auditedContracts.add(addr.toLowerCase()));
        } else if (typeof auditedData === 'object') {
          // New format: {"0xaddr1": {...}, "0xaddr2": {...}}
          Object.keys(auditedData).forEach(addr => this.auditedContracts.add(addr.toLowerCase()));
        }
      }
      
      // Load split files if they exist
      const dataDir = path.dirname(this.auditedContractsFile);
      if (fs.existsSync(dataDir)) {
        const files = fs.readdirSync(dataDir);
        const splitFiles = files.filter(f => f.match(/^audited-contracts-\d+\.json$/));
        
        for (const file of splitFiles) {
          const filePath = path.join(dataDir, file);
          const data = fs.readFileSync(filePath, 'utf8');
          const auditedData = JSON.parse(data);
          
          if (typeof auditedData === 'object' && !Array.isArray(auditedData)) {
            Object.keys(auditedData).forEach(addr => this.auditedContracts.add(addr.toLowerCase()));
          }
        }
      }
      
      if (this.auditedContracts.size > 0) {
        console.log(`📋 Loaded ${this.auditedContracts.size} previously audited contracts`);
      }
    } catch (error) {
      console.error('Error loading audited contracts:', error.message);
      this.auditedContracts = new Set();
    }
  }
  
  /**
   * Save audited contracts to storage
   */
  saveAuditedContracts() {
    try {
      const contracts = Array.from(this.auditedContracts);
      fs.writeFileSync(
        this.auditedContractsFile,
        JSON.stringify(contracts, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('Error saving audited contracts:', error.message);
    }
  }
  
  /**
   * Check if a contract has been audited
   * Always checks the file to ensure we have the latest state (important after restarts)
   * @param {string} address - Contract address
   * @returns {boolean} True if already audited
   */
  isAudited(address) {
    const normalizedAddress = address.toLowerCase();
    
    // First check in-memory Set (fast)
    if (this.auditedContracts.has(normalizedAddress)) {
      return true;
    }
    
    // If not in Set, check file directly (ensures we catch contracts audited before restart)
    // This is important for persistence across bot restarts
    try {
      // Check main file
      if (fs.existsSync(this.auditedContractsFile)) {
        const data = fs.readFileSync(this.auditedContractsFile, 'utf8');
        const auditedData = JSON.parse(data);
        
        // Support both old array format and new object format
        if (Array.isArray(auditedData)) {
          if (auditedData.includes(normalizedAddress)) {
            // Update Set for future checks
            this.auditedContracts.add(normalizedAddress);
            return true;
          }
        } else if (typeof auditedData === 'object') {
          if (auditedData[normalizedAddress]) {
            // Update Set for future checks
            this.auditedContracts.add(normalizedAddress);
            return true;
          }
        }
      }
      
      // Check split files if they exist
      const dataDir = path.dirname(this.auditedContractsFile);
      if (fs.existsSync(dataDir)) {
        const files = fs.readdirSync(dataDir);
        const splitFiles = files.filter(f => f.match(/^audited-contracts-\d+\.json$/));
        
        for (const file of splitFiles) {
          const filePath = path.join(dataDir, file);
          const data = fs.readFileSync(filePath, 'utf8');
          const auditedData = JSON.parse(data);
          
          if (typeof auditedData === 'object' && !Array.isArray(auditedData)) {
            if (auditedData[normalizedAddress]) {
              // Update Set for future checks
              this.auditedContracts.add(normalizedAddress);
              return true;
            }
          }
        }
      }
    } catch (error) {
      // If file read fails, fall back to in-memory Set
      // This shouldn't happen often, but we want to be resilient
      console.error(`Warning: Error checking audited contracts file for ${normalizedAddress}:`, error.message);
    }
    
    return false;
  }
  
  /**
   * Mark a contract as audited
   * @param {string} address - Contract address
   */
  markAsAudited(address) {
    const normalizedAddress = address.toLowerCase();
    this.auditedContracts.add(normalizedAddress);
    this.saveAuditedContracts();
  }
  
  /**
   * Record audit result with vulnerability details
   * @param {string} address - Contract address
   * @param {boolean} hasVulnerabilities - Whether vulnerabilities were found
   * @param {Array<string>} vulnerabilityNames - List of vulnerability types found
   * @param {boolean} failed - Whether the audit failed
   * @param {string} errorMessage - Error message if audit failed
   * @param {string} skipReason - Reason for skipping (e.g., non-Solidity language)
   */
  recordAuditResult(address, hasVulnerabilities, vulnerabilityNames = [], failed = false, errorMessage = null, skipReason = null) {
    try {
      const normalizedAddress = address.toLowerCase();
      
      // Load existing data
      let auditedData = {};
      if (fs.existsSync(this.auditedContractsFile)) {
        try {
          const existing = fs.readFileSync(this.auditedContractsFile, 'utf8');
          const parsed = JSON.parse(existing);
          
          // Convert old array format to new object format
          if (Array.isArray(parsed)) {
            parsed.forEach(addr => {
              auditedData[addr] = { hasVulnerabilities: false, vulnerabilities: [] };
            });
          } else {
            auditedData = parsed;
          }
        } catch (e) {
          auditedData = {};
        }
      }
      
      // Check if already recorded (prevent overwriting existing audits)
      if (auditedData[normalizedAddress] && !failed) {
        // Contract already audited - don't overwrite unless this is a failed audit retry
        const existing = auditedData[normalizedAddress];
        if (!existing.failed) {
          // Already has a successful audit - skip recording
          console.log(`   ⚠️  Contract ${normalizedAddress} already audited - skipping duplicate record`);
          return;
        }
      }
      
      // Update with new audit result
      auditedData[normalizedAddress] = {
        hasVulnerabilities: failed ? null : hasVulnerabilities,
        vulnerabilities: failed ? [] : vulnerabilityNames,
        auditedAt: new Date().toISOString(),
        failed: failed,
        errorMessage: failed ? errorMessage : null
      };
      
      // Add to Set
      this.auditedContracts.add(normalizedAddress);
      
      // Save back
      fs.writeFileSync(
        this.auditedContractsFile,
        JSON.stringify(auditedData, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('Error recording audit result:', error.message);
    }
  }
  
  /**
   * Check if contract source matches the pre-audit regex pattern for Arbitrary External Call vulnerability
   * @param {string} contractSource - Contract source code
   * @returns {boolean} True if pattern matches, false otherwise
   */
  checkPreAuditPattern(contractSource) {
    if (!SETTINGS.ENABLE_PRE_AUDIT_REGEX_CHECK) {
      // If pre-audit check is disabled, always return true (allow audit)
      return true;
    }
    
    try {
      // Create a new regex instance each time to avoid state issues with global flag
      const pattern = new RegExp(SETTINGS.PRE_AUDIT_REGEX_PATTERN, 'g');
      const matches = pattern.test(contractSource);
      // Reset lastIndex to avoid state issues
      pattern.lastIndex = 0;
      return matches;
    } catch (error) {
      console.error(`   ⚠️  Error checking pre-audit pattern: ${error.message}`);
      // On error, allow audit to proceed (fail open)
      return true;
    }
  }
  
  /**
   * Audit a contract source file using OpenAI
   * @param {string} contractAddress - Contract address
   * @param {string} sourceFilePath - Path to the contract source file
   * @returns {Promise<Object>} Audit result
   */
  async auditContract(contractAddress, sourceFilePath) {
    const normalizedAddress = contractAddress.toLowerCase();
    
    // Check if contract is already audited or currently being audited
    // First check: in-memory Set (fast)
    if (this.auditedContracts.has(normalizedAddress)) {
      console.log(`   ⏭️  ${contractAddress}: Already audited (in-memory cache) - skipping`);
      return { skipped: true, address: contractAddress, reason: 'already_audited' };
    }
    
    // Check if contract is currently being audited (prevents concurrent audits)
    if (this.auditingContracts.has(normalizedAddress)) {
      console.log(`   ⏭️  ${contractAddress}: Audit already in progress - skipping duplicate request`);
      return { skipped: true, address: contractAddress, reason: 'audit_in_progress' };
    }
    
    // Second check: file directly (prevents race conditions in parallel processing)
    // This is critical - checks the actual file to catch contracts audited before restart
    if (this.isAudited(contractAddress)) {
      // Contract was found in file, add to Set and skip
      this.auditedContracts.add(normalizedAddress);
      console.log(`   ⏭️  ${contractAddress}: Already audited (found in file) - skipping`);
      return { skipped: true, address: contractAddress, reason: 'already_audited' };
    }
    
    // Mark as currently being audited BEFORE starting the audit
    // This prevents concurrent audits of the same contract (critical race condition protection)
    this.auditingContracts.add(normalizedAddress);
    
    try {
      
      // Read contract source (don't upload file - .sol is not supported)
      const contractSource = fs.readFileSync(sourceFilePath, "utf8");
      
      // Pre-audit regex check: Only audit if pattern matches (when enabled)
      if (SETTINGS.ENABLE_PRE_AUDIT_REGEX_CHECK) {
        const patternMatches = this.checkPreAuditPattern(contractSource);
        if (!patternMatches) {
          // Remove from auditing set since we're skipping
          this.auditingContracts.delete(normalizedAddress);
          console.log(`   ⏭️  ${contractAddress}: Pre-audit regex check failed - skipping audit (pattern not found)`);
          return { 
            skipped: true, 
            address: contractAddress, 
            reason: 'pre_audit_regex_no_match' 
          };
        }
        console.log(`   ✅ ${contractAddress}: Pre-audit regex check passed - pattern found`);
      }
      
      // Mark as audited (moved to Set of completed audits)
      this.auditedContracts.add(normalizedAddress);
      
      const response = await this.client.responses.create({
        model: "gpt-4.1",
        text: {
          format: { type: "json_object" }
        },
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: this.systemPrompt
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: this.userPrompt.replace('<PASTE SOLIDITY CODE HERE>', contractSource)
              }
            ]
          }
        ]
      });
      
      // Parse the response
      const auditResultText = response.output_text;
      const auditResult = JSON.parse(auditResultText);
      console.log(`   ✅ Audit completed`);
      
      // Check if vulnerabilities were found
      const hasVulnerabilities = auditResult.critical_vulnerability_exists;
      const vulnerabilityNames = hasVulnerabilities 
        ? auditResult.critical_issues.map(issue => issue.vulnerability_type)
        : [];
      
      // Only save audit result files if critical vulnerabilities exist (disk space optimization)
      let resultFilePathTxt = null;
      
      if (hasVulnerabilities) {
        // Use independent audit result index (starting from 0)
        const resultFileNameTxt = `${this.auditResultIndex}_${contractAddress.toLowerCase()}_audit.txt`;
        resultFilePathTxt = path.join(this.auditResultsDir, resultFileNameTxt);
        
        // Save human-readable format
      const resultContent = `Contract Address: ${contractAddress}
Source File: ${path.basename(sourceFilePath)}
Audit Date: ${new Date().toISOString()}
Model: gpt-4.1

================================ AUDIT RESULT ================================

Critical Vulnerability: ${auditResult.critical_vulnerability_exists ? '🚨 YES' : '✅ NO'}

Summary:
${auditResult.summary}

${auditResult.critical_issues && auditResult.critical_issues.length > 0 ? `
Critical Issues Found:
${auditResult.critical_issues.map((issue, idx) => `
${idx + 1}. ${issue.title}
   Type: ${issue.vulnerability_type}
   Function: ${issue.affected_function}
   
   Attack Scenario:
   ${issue.attack_scenario}
   
   Impact:
   ${issue.impact}
   
   Recommended Fix:
   ${issue.recommended_fix}
`).join('\n')}
` : 'No critical issues detected.'}

==============================================================================
`;
      
        fs.writeFileSync(resultFilePathTxt, resultContent, 'utf8');
        console.log(`   💾 Audit result saved: ${path.basename(resultFileNameTxt)}`);
        
        // Increment index for next audit result
        this.auditResultIndex++;
      }
      
      if (hasVulnerabilities) {
        console.log(`   🚨 CRITICAL VULNERABILITIES FOUND!`);
        console.log(`   🔴 Issues: ${auditResult.critical_issues.length}`);
        
        // Send Telegram notification if configured
        if (this.telegramConfig && this.telegramConfig.botToken && this.telegramConfig.chatId) {
          await sendVulnerabilityAlert(
            contractAddress,
            vulnerabilityNames,
            this.telegramConfig.botToken,
            this.telegramConfig.chatId
          );
        }
      } else {
        console.log(`   ✅ No critical vulnerabilities found`);
        console.log(`   ℹ️  Audit result not saved (disk space optimization)`);
      }
      
      // Delete the source file to save disk space
      try {
        fs.unlinkSync(sourceFilePath);
        console.log(`   🗑️  Source file deleted (disk space saved)`);
      } catch (deleteError) {
        console.error(`   ⚠️  Could not delete source file:`, deleteError.message);
      }
      
      // Record audit result with vulnerability details
      this.recordAuditResult(contractAddress, hasVulnerabilities, vulnerabilityNames);
      
      // Update statistics (if statistics tracker is available)
      if (this.statistics) {
        this.statistics.recordAudit(hasVulnerabilities);
      }
      
      // Remove from auditing set (audit completed successfully)
      this.auditingContracts.delete(normalizedAddress);
      
      // No cleanup needed (file content sent directly in message)
      
      return {
        address: contractAddress,
        hasVulnerabilities,
        vulnerabilityNames,
        result: auditResult,
        resultFileTxt: resultFilePathTxt,
        criticalIssuesCount: auditResult.critical_issues?.length || 0,
      };
      
    } catch (error) {
      console.error(`   ❌ Audit error: ${error.message?.slice(0, 150) || error}`);
      
      // Check if it's a rate limit error
      const isRateLimitError = error.message && (
        error.message.includes('Rate limit') || 
        error.message.includes('429') || 
        error.message.includes('too large')
      );
      
      // For non-rate-limit errors, remove from both Sets to allow retry
      // Rate limit errors should keep the contract marked to prevent immediate retries
      if (!isRateLimitError) {
        // Remove from both Sets to allow retry on next attempt
        this.auditedContracts.delete(normalizedAddress);
      }
      
      // Always remove from auditing set (audit attempt completed, even if failed)
      this.auditingContracts.delete(normalizedAddress);
      
      // Record failed audit
      this.recordAuditResult(contractAddress, false, [], true, error.message);
      
      // Update statistics (if statistics tracker is available)
      if (this.statistics) {
        this.statistics.recordAuditFailure();
      }
      
      if (isRateLimitError) {
        if (error.message.includes('tokens per min')) {
          console.log(`   ⏸️  Rate limit - waiting 60s...`);
        }
      }
      
      return {
        address: contractAddress,
        error: error.message,
        hasVulnerabilities: false,
        result: null,
        failed: true
      };
    }
  }
  
  /**
   * Get statistics about audited contracts
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      totalAudited: this.auditedContracts.size,
      contracts: Array.from(this.auditedContracts),
    };
  }
}
