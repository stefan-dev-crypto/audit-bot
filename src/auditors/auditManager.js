// Audit Manager
// Orchestrates multiple audit tools

const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

/**
 * Manages multiple audit tools and coordinates audits
 */
class AuditManager {
  constructor(config = {}) {
    this.config = config;
    this.auditors = new Map();
    this.resultsDir = config.resultsDir || path.join(__dirname, '../../audit-results');
    this.autoSave = config.autoSave !== false; // Default to true
  }

  /**
   * Register an auditor
   * @param {string} name - Auditor name
   * @param {BaseAuditor} auditor - Auditor instance
   */
  registerAuditor(name, auditor) {
    this.auditors.set(name, auditor);
    logger.debug(`Registered auditor: ${name}`);
  }

  /**
   * Initialize all registered auditors
   * @returns {Promise<void>}
   */
  async initialize() {
    logger.info('Initializing Audit Manager...');
    
    // Ensure results directory exists
    try {
      await fs.mkdir(this.resultsDir, { recursive: true });
    } catch (error) {
      logger.warn(`Failed to create results directory: ${error.message}`);
    }

    // Initialize all auditors
    const initPromises = Array.from(this.auditors.entries()).map(async ([name, auditor]) => {
      try {
        await auditor.initialize();
        const available = await auditor.isAvailable();
        if (available) {
          logger.info(`✅ ${name} auditor ready`);
        } else {
          logger.warn(`⚠️  ${name} auditor not available`);
        }
      } catch (error) {
        logger.error(`Failed to initialize ${name}: ${error.message}`);
      }
    });

    await Promise.all(initPromises);
    logger.info(`Audit Manager initialized with ${this.auditors.size} auditors`);
  }

  /**
   * Run all available auditors on a contract
   * @param {Object} options
   * @param {string} options.contractAddress - Contract address
   * @param {string} options.sourceDir - Source directory
   * @param {string} options.mainFile - Main contract file (optional)
   * @param {Array<string>} options.auditors - Specific auditors to run (optional, runs all if not specified)
   * @returns {Promise<Object>} Combined audit results
   */
  async auditContract({ contractAddress, sourceDir, mainFile, auditors: requestedAuditors }) {
    const startTime = Date.now();
    // Use consoleOutput for cleaner display
    const consoleOutput = require('../utils/consoleOutput');
    consoleOutput.auditStart(contractAddress);

    const results = {
      contractAddress,
      sourceDir,
      timestamp: new Date().toISOString(),
      auditors: {},
      summary: {
        totalAuditors: 0,
        successfulAudits: 0,
        failedAudits: 0,
        totalFindings: 0,
        criticalFindings: 0,
        highFindings: 0,
        mediumFindings: 0,
        lowFindings: 0,
        infoFindings: 0,
      },
      duration: 0
    };

    // Determine which auditors to run
    const auditorsToRun = requestedAuditors 
      ? Array.from(this.auditors.entries()).filter(([name]) => requestedAuditors.includes(name))
      : Array.from(this.auditors.entries());

    results.summary.totalAuditors = auditorsToRun.length;

    // Run auditors in parallel
    const auditPromises = auditorsToRun.map(async ([name, auditor]) => {
      try {
        // Check if auditor is available
        const available = await auditor.isAvailable();
        if (!available) {
          logger.warn(`Skipping ${name} - not available`);
          return {
            name,
            result: auditor.createResult({
              success: false,
              error: 'Auditor not available',
              metadata: { contractAddress }
            })
          };
        }

        // Run audit
        const result = await auditor.audit({
          contractAddress,
          sourceDir,
          mainFile
        });

        return { name, result };
      } catch (error) {
        logger.error(`Error running ${name}: ${error.message}`);
        return {
          name,
          result: auditor.createResult({
            success: false,
            error: error.message,
            metadata: { contractAddress }
          })
        };
      }
    });

    const auditResults = await Promise.all(auditPromises);

    // Aggregate results
    for (const { name, result } of auditResults) {
      results.auditors[name] = result;

      if (result.success) {
        results.summary.successfulAudits++;
        results.summary.totalFindings += result.findings?.length || 0;

        // Count by severity
        if (result.findings) {
          for (const finding of result.findings) {
            switch (finding.severity) {
              case 'critical':
                results.summary.criticalFindings++;
                break;
              case 'high':
                results.summary.highFindings++;
                break;
              case 'medium':
              case 'warning':
                results.summary.mediumFindings++;
                break;
              case 'low':
                results.summary.lowFindings++;
                break;
              case 'info':
              case 'informational':
                results.summary.infoFindings++;
                break;
            }
          }
        }
      } else {
        results.summary.failedAudits++;
      }
    }

    results.duration = Date.now() - startTime;

    // Use consoleOutput for cleaner display
    consoleOutput.auditSummary(results);

    // Save results
    if (this.autoSave) {
      await this.saveResults(contractAddress, results);
    }

    return results;
  }

  /**
   * Save audit results to file
   * @param {string} contractAddress - Contract address
   * @param {Object} results - Audit results
   * @returns {Promise<string>} File path
   */
  async saveResults(contractAddress, results) {
    try {
      const normalizedAddress = contractAddress.toLowerCase();
      
      // Generate human-readable report only (no JSON format)
      const reportGenerator = require('../utils/reportGenerator');
      const reportPath = path.join(this.resultsDir, `${normalizedAddress}.md`);
      await reportGenerator.generateContractReport(results, reportPath);

      // Update summary dashboard
      const summaryPath = path.join(this.resultsDir, 'AUDIT_SUMMARY.md');
      await reportGenerator.generateSummaryDashboard(this.resultsDir, summaryPath);
      
      // Log file operations in verbose mode only
      const consoleOutput = require('../utils/consoleOutput');
      consoleOutput.fileSaved('report', reportPath);
      consoleOutput.fileSaved('dashboard', summaryPath);

      return reportPath;
    } catch (error) {
      logger.error(`Failed to save audit results: ${error.message}`);
      return null;
    }
  }

  /**
   * Get audit results for a contract
   * @param {string} contractAddress - Contract address
   * @param {boolean} latest - Get only latest result
   * @returns {Promise<Array|Object>}
   */
  async getResults(contractAddress, latest = true) {
    try {
      const normalizedAddress = contractAddress.toLowerCase();
      
      if (latest) {
        const latestPath = path.join(this.resultsDir, `${normalizedAddress}_latest.json`);
        const content = await fs.readFile(latestPath, 'utf8');
        return JSON.parse(content);
      } else {
        // Get all results for this contract
        const files = await fs.readdir(this.resultsDir);
        const contractFiles = files.filter(f => f.startsWith(normalizedAddress) && !f.endsWith('_latest.json'));
        
        const results = [];
        for (const file of contractFiles) {
          const content = await fs.readFile(path.join(this.resultsDir, file), 'utf8');
          results.push(JSON.parse(content));
        }
        
        return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      }
    } catch (error) {
      logger.debug(`No results found for ${contractAddress}: ${error.message}`);
      return latest ? null : [];
    }
  }

  /**
   * Get list of registered auditors with their status
   * @returns {Promise<Array>}
   */
  async getAuditorsStatus() {
    const status = [];
    
    for (const [name, auditor] of this.auditors.entries()) {
      const available = await auditor.isAvailable();
      status.push({
        name,
        enabled: auditor.enabled,
        initialized: auditor.initialized,
        available
      });
    }
    
    return status;
  }

  /**
   * Enable/disable an auditor
   * @param {string} name - Auditor name
   * @param {boolean} enabled - Enable or disable
   */
  setAuditorEnabled(name, enabled) {
    const auditor = this.auditors.get(name);
    if (auditor) {
      auditor.enabled = enabled;
      logger.info(`${name} auditor ${enabled ? 'enabled' : 'disabled'}`);
    } else {
      logger.warn(`Auditor ${name} not found`);
    }
  }
}

module.exports = AuditManager;
