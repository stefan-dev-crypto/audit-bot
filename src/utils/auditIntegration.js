// Audit Integration Helper
// Provides easy integration with the audit system

const path = require('path');
const { AuditManager, SlitherAuditor } = require('../auditors');
const config = require('../config');
const logger = require('./logger');

// Singleton audit manager instance
let auditManagerInstance = null;

/**
 * Initialize the audit manager with configured auditors
 * @returns {Promise<AuditManager>}
 */
async function initializeAuditManager() {
  if (auditManagerInstance) {
    return auditManagerInstance;
  }

  logger.info('Initializing Audit Manager...');

  // Create audit manager
  auditManagerInstance = new AuditManager({
    resultsDir: path.resolve(config.audit.resultsDir),
    autoSave: config.audit.autoSave,
  });

  // Register Slither auditor if enabled
  if (config.audit.slither.enabled) {
    const slitherAuditor = new SlitherAuditor({
      enabled: config.audit.slither.enabled,
      slitherPath: config.audit.slither.path,
      timeout: config.audit.slither.timeout,
      additionalArgs: config.audit.slither.additionalArgs,
      solcSelectPath: config.audit.slither.solcSelectPath,
      autoSelectVersion: config.audit.slither.autoSelectVersion,
      restoreVersion: config.audit.slither.restoreVersion,
    });
    auditManagerInstance.registerAuditor('slither', slitherAuditor);
  }

  // TODO: Register other auditors here as they are implemented
  // Example:
  // if (config.audit.mythril.enabled) {
  //   const mythrilAuditor = new MythrilAuditor(config.audit.mythril);
  //   auditManagerInstance.registerAuditor('mythril', mythrilAuditor);
  // }

  // Initialize all auditors
  await auditManagerInstance.initialize();

  // Log auditor status
  const status = await auditManagerInstance.getAuditorsStatus();
  const availableAuditors = status.filter(s => s.available).map(s => s.name);
  
  if (availableAuditors.length > 0) {
    logger.info(`✅ Available auditors: ${availableAuditors.join(', ')}`);
  } else {
    logger.warn('⚠️  No auditors available');
  }

  return auditManagerInstance;
}

/**
 * Get the audit manager instance
 * @returns {AuditManager|null}
 */
function getAuditManager() {
  return auditManagerInstance;
}

/**
 * Audit a contract
 * @param {string} contractAddress - Contract address
 * @param {string} sourceDir - Source directory (defaults to sources/{address})
 * @param {string} mainFile - Main contract file (optional)
 * @returns {Promise<Object|null>} Audit results or null if auditing disabled
 */
async function auditContract(contractAddress, sourceDir = null, mainFile = null) {
  // Check if auditing is enabled
  if (!config.audit.enabled) {
    logger.debug('Auditing disabled in configuration');
    return null;
  }

  // Ensure audit manager is initialized
  if (!auditManagerInstance) {
    await initializeAuditManager();
  }

  // Default source directory
  if (!sourceDir) {
    sourceDir = path.resolve('sources', contractAddress.toLowerCase());
  }

  try {
    // Run audit
    const results = await auditManagerInstance.auditContract({
      contractAddress,
      sourceDir,
      mainFile,
    });

    return results;
  } catch (error) {
    logger.error(`Failed to audit contract ${contractAddress}: ${error.message}`);
    return null;
  }
}

/**
 * Trigger audit on contract detection
 * @param {string} contractAddress - Contract address
 * @returns {Promise<Object|null>}
 */
async function auditOnDetection(contractAddress) {
  if (!config.audit.enabled || !config.audit.auditOnDetection) {
    return null;
  }

  logger.info(`🔍 Triggering audit for detected contract: ${contractAddress}`);
  
  // Verify source code exists before auditing
  const path = require('path');
  const fs = require('fs').promises;
  const sourcesDir = path.resolve('sources', contractAddress.toLowerCase());
  
  try {
    // Check if source directory exists and has .sol files
    await fs.access(sourcesDir);
    const files = await fs.readdir(sourcesDir);
    
    // Check for .sol files in root or subdirectories
    let hasSolFiles = false;
    
    // Check root directory
    for (const file of files) {
      if (file.endsWith('.sol')) {
        hasSolFiles = true;
        break;
      }
    }
    
    // Check subdirectories if no .sol files in root
    if (!hasSolFiles) {
      for (const file of files) {
        const filePath = path.join(sourcesDir, file);
        try {
          const stat = await fs.stat(filePath);
          if (stat.isDirectory()) {
            const subFiles = await fs.readdir(filePath);
            if (subFiles.some(f => f.endsWith('.sol'))) {
              hasSolFiles = true;
              break;
            }
          }
        } catch (err) {
          // Skip files we can't stat
          continue;
        }
      }
    }
    
    if (!hasSolFiles) {
      logger.warn(`⚠️  No source files found for ${contractAddress}, skipping audit`);
      logger.warn(`   Source code must be fetched first.`);
      return null;
    }
    
    logger.debug(`✅ Source code verified for ${contractAddress}, proceeding with audit`);
  } catch (error) {
    logger.warn(`⚠️  Source code not available for ${contractAddress}: ${error.message}`);
    logger.warn(`   Skipping audit. Source code must be fetched first.`);
    return null;
  }
  
  return await auditContract(contractAddress);
}

/**
 * Get audit results for a contract
 * @param {string} contractAddress - Contract address
 * @param {boolean} latest - Get only latest (default: true)
 * @returns {Promise<Object|Array|null>}
 */
async function getAuditResults(contractAddress, latest = true) {
  if (!auditManagerInstance) {
    return null;
  }

  return await auditManagerInstance.getResults(contractAddress, latest);
}

/**
 * Get status of all auditors
 * @returns {Promise<Array>}
 */
async function getAuditorsStatus() {
  if (!auditManagerInstance) {
    await initializeAuditManager();
  }

  return await auditManagerInstance.getAuditorsStatus();
}

module.exports = {
  initializeAuditManager,
  getAuditManager,
  auditContract,
  auditOnDetection,
  getAuditResults,
  getAuditorsStatus,
};
