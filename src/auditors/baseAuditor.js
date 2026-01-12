// Base Auditor Class
// All audit tool implementations should extend this class

const logger = require('../utils/logger');

/**
 * Base class for all audit tools
 * Provides a common interface for different audit tools
 */
class BaseAuditor {
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
    this.enabled = config.enabled !== false; // Default to enabled
    this.initialized = false;
  }

  /**
   * Initialize the auditor
   * Override this method to perform setup tasks
   * @returns {Promise<boolean>} True if initialization successful
   */
  async initialize() {
    logger.info(`Initializing ${this.name} auditor...`);
    this.initialized = true;
    return true;
  }

  /**
   * Check if the auditor is available and ready to use
   * Override this method to check for tool installation, dependencies, etc.
   * @returns {Promise<boolean>} True if auditor is available
   */
  async isAvailable() {
    return this.initialized && this.enabled;
  }

  /**
   * Audit a contract
   * This is the main method that should be overridden
   * @param {Object} options - Audit options
   * @param {string} options.contractAddress - Contract address
   * @param {string} options.sourceDir - Directory containing source files
   * @param {string} options.mainFile - Main contract file (optional)
   * @returns {Promise<Object>} Audit results
   */
  async audit(options) {
    throw new Error(`audit() method must be implemented by ${this.name}`);
  }

  /**
   * Parse raw output from the audit tool into standardized format
   * @param {any} rawOutput - Raw output from the tool
   * @returns {Object} Standardized audit result
   */
  parseOutput(rawOutput) {
    return {
      auditor: this.name,
      timestamp: new Date().toISOString(),
      success: false,
      error: 'parseOutput() not implemented',
      rawOutput
    };
  }

  /**
   * Get standardized result format
   * @param {boolean} success - Whether audit succeeded
   * @param {Array} findings - Array of findings/issues
   * @param {Object} metadata - Additional metadata
   * @param {any} rawOutput - Raw output from tool
   * @param {string} error - Error message if failed
   * @returns {Object} Standardized result
   */
  createResult({ success, findings = [], metadata = {}, rawOutput = null, error = null }) {
    return {
      auditor: this.name,
      timestamp: new Date().toISOString(),
      success,
      findings,
      metadata: {
        ...metadata,
        findingsCount: findings.length,
        criticalCount: findings.filter(f => f.severity === 'critical' || f.severity === 'high').length,
        warningCount: findings.filter(f => f.severity === 'medium' || f.severity === 'warning').length,
        infoCount: findings.filter(f => f.severity === 'low' || f.severity === 'info' || f.severity === 'informational').length,
      },
      rawOutput,
      error
    };
  }

  /**
   * Get auditor info
   * @returns {Object} Auditor information
   */
  getInfo() {
    return {
      name: this.name,
      enabled: this.enabled,
      initialized: this.initialized,
      config: this.config
    };
  }
}

module.exports = BaseAuditor;
