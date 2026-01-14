import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

/**
 * OpenAI Auditor
 * Audits contract source code using OpenAI API
 */
export class OpenAIAuditor {
  constructor(apiKey) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
    
    this.auditResultsDir = path.join(process.cwd(), 'data', 'audit-results');
    this.auditedContractsFile = path.join(process.cwd(), 'data', 'audited-contracts.json');
    this.auditedContracts = new Set();
    
    this.systemPrompt = `
You are a senior Solidity smart contract security auditor.

Rules:
- ONLY consider attacks by a GENERAL EXTERNAL USER.
- IGNORE owner/admin/governance privileged actions.
- ONLY report CRITICAL vulnerabilities that allow:
  - theft of ETH
  - theft of ERC20/ERC721/ERC1155 tokens
  - permanent fund lock
  - unlimited mint or drain

DO NOT report:
- Gas optimizations
- Low/Medium issues
- Centralization risks
- Admin misuse
- Best practices

If NO critical fund-loss vulnerability exists, explicitly state so.
Return STRICT JSON only.
`;

    this.userPrompt = `
Analyze the uploaded Solidity contract.

Determine whether a general external attacker can steal or permanently lock
ETH or tokens held by this contract.

Classify the result using this JSON format:
{
  "critical_vulnerability_exists": boolean,
  "summary": string,
  "attack_surface": ["ETH", "ERC20", "ERC721", "ERC1155"],
  "critical_issues": [
    {
      "title": string,
      "vulnerability_type": string,
      "affected_function": string,
      "attack_scenario": string,
      "impact": string,
      "recommended_fix": string
    }
  ]
}
`;
    
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
    
    // Load previously audited contracts
    this.loadAuditedContracts();
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
   * @param {string} address - Contract address
   * @returns {boolean} True if already audited
   */
  isAudited(address) {
    const normalizedAddress = address.toLowerCase();
    return this.auditedContracts.has(normalizedAddress);
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
   */
  recordAuditResult(address, hasVulnerabilities, vulnerabilityNames = [], failed = false, errorMessage = null) {
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
   * Audit a contract source file using OpenAI
   * @param {string} contractAddress - Contract address
   * @param {string} sourceFilePath - Path to the contract source file
   * @returns {Promise<Object>} Audit result
   */
  async auditContract(contractAddress, sourceFilePath) {
    try {
      // Check if already audited
      if (this.isAudited(contractAddress)) {
        return { skipped: true, address: contractAddress };
      }
      
      // Upload contract file to OpenAI
      const file = await this.client.files.create({
        file: fs.createReadStream(sourceFilePath),
        purpose: "user_data",
      });
      
      // Create a response using the uploaded file
      const response = await this.client.responses.create({
        model: 'gpt-4.1',
        response_format: { type: 'json_object' },
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: this.systemPrompt,
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_file',
                file_id: file.id,
              },
              {
                type: 'input_text',
                text: this.userPrompt,
              },
            ],
          },
        ],
        max_tokens: 4000,
        temperature: 0.3,
      });
      
      // Parse the response
      const auditResultText = response.output_text;
      const auditResult = JSON.parse(auditResultText);
      
      // Clean up: Delete the uploaded file from OpenAI
      try {
        await this.client.files.del(file.id);
      } catch (deleteError) {
        // Silently ignore if file deletion fails
      }
      console.log(`   ✅ Audit completed`);
      
      // Check if vulnerabilities were found
      const hasVulnerabilities = auditResult.critical_vulnerability_exists;
      const vulnerabilityNames = hasVulnerabilities 
        ? auditResult.critical_issues.map(issue => issue.vulnerability_type)
        : [];
      
      // Only save audit result files if critical vulnerabilities exist (disk space optimization)
      let resultFilePathJson = null;
      let resultFilePathTxt = null;
      
      if (hasVulnerabilities) {
        const resultFileNameJson = `${contractAddress.toLowerCase()}_audit.json`;
        const resultFileNameTxt = `${contractAddress.toLowerCase()}_audit.txt`;
        resultFilePathJson = path.join(this.auditResultsDir, resultFileNameJson);
        resultFilePathTxt = path.join(this.auditResultsDir, resultFileNameTxt);
        
        // Save JSON format
        fs.writeFileSync(resultFilePathJson, JSON.stringify(auditResult, null, 2), 'utf8');
        
        // Save human-readable format
      const resultContent = `Contract Address: ${contractAddress}
Source File: ${path.basename(sourceFilePath)}
Audit Date: ${new Date().toISOString()}
Model: gpt-4.1

================================ AUDIT RESULT ================================

Critical Vulnerability: ${auditResult.critical_vulnerability_exists ? '🚨 YES' : '✅ NO'}

Summary:
${auditResult.summary}

Attack Surface: ${auditResult.attack_surface.join(', ') || 'None'}

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

Raw JSON:
${JSON.stringify(auditResult, null, 2)}
`;
      
        fs.writeFileSync(resultFilePathTxt, resultContent, 'utf8');
        console.log(`   💾 Audit result saved: ${path.basename(resultFileNameTxt)}`);
      }
      
      if (hasVulnerabilities) {
        console.log(`   🚨 CRITICAL VULNERABILITIES FOUND!`);
        console.log(`   📊 Attack Surface: ${auditResult.attack_surface.join(', ')}`);
        console.log(`   🔴 Issues: ${auditResult.critical_issues.length}`);
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
      
      // No cleanup needed (file content sent directly in message)
      
      return {
        address: contractAddress,
        hasVulnerabilities,
        vulnerabilityNames,
        result: auditResult,
        resultFileTxt: resultFilePathTxt,
        criticalIssuesCount: auditResult.critical_issues?.length || 0,
        attackSurface: auditResult.attack_surface || [],
      };
      
    } catch (error) {
      console.error(`   ❌ Audit error: ${error.message?.slice(0, 150) || error}`);
      
      // Record failed audit
      this.recordAuditResult(contractAddress, false, [], true, error.message);
      
      // Update statistics (if statistics tracker is available)
      if (this.statistics) {
        this.statistics.recordAuditFailure();
      }
      
      // Check if it's a rate limit error
      if (error.message && (error.message.includes('Rate limit') || error.message.includes('429') || error.message.includes('too large'))) {
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
