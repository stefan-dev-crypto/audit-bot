// Slither Auditor
// https://github.com/crytic/slither

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const BaseAuditor = require('./baseAuditor');
const logger = require('../utils/logger');

/**
 * Slither static analysis auditor
 * Requires Slither to be installed: pip3 install slither-analyzer
 */
class SlitherAuditor extends BaseAuditor {
  constructor(config = {}) {
    super('Slither', config);
    this.slitherPath = config.slitherPath || 'slither';
    this.timeout = config.timeout || 120000; // 2 minutes default
    this.additionalArgs = config.additionalArgs || [];
    this.solcSelectPath = config.solcSelectPath || 'solc-select';
    this.autoSelectVersion = config.autoSelectVersion !== false; // Default to true
    this.restoreVersion = config.restoreVersion !== false; // Default to true
    this.originalSolcVersion = null; // Store original version to restore
  }

  /**
   * Check if Slither is installed and available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    if (!this.enabled) {
      return false;
    }

    try {
      const version = await this.getVersion();
      logger.info(`Slither version: ${version}`);
      return true;
    } catch (error) {
      logger.warn(`Slither not available: ${error.message}`);
      logger.warn('Install Slither: pip3 install slither-analyzer');
      return false;
    }
  }

  /**
   * Get Slither version
   * @returns {Promise<string>}
   */
  async getVersion() {
    return new Promise((resolve, reject) => {
      const process = spawn(this.slitherPath, ['--version']);
      
      let output = '';
      process.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        output += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0 || output.includes('Slither')) {
          resolve(output.trim());
        } else {
          reject(new Error('Slither not found'));
        }
      });
      
      process.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Audit a contract using Slither
   * @param {Object} options
   * @param {string} options.contractAddress - Contract address
   * @param {string} options.sourceDir - Directory containing source files
   * @param {string} options.mainFile - Main contract file (optional)
   * @returns {Promise<Object>}
   */
  async audit({ contractAddress, sourceDir, mainFile }) {
    const startTime = Date.now();
    
    try {
      logger.info(`🔍 Running Slither audit for ${contractAddress}...`);
      
      // Verify source directory exists
      try {
        await fs.access(sourceDir);
      } catch (error) {
        return this.createResult({
          success: false,
          error: `Source directory not found: ${sourceDir}`,
          metadata: { contractAddress, duration: Date.now() - startTime }
        });
      }

      // Determine target path (main file or directory)
      let targetPath = sourceDir;
      if (mainFile) {
        const mainFilePath = path.join(sourceDir, mainFile);
        try {
          await fs.access(mainFilePath);
          targetPath = mainFilePath;
        } catch (error) {
          logger.warn(`Main file ${mainFile} not found, using directory`);
        }
      }

      // Auto-select Solidity version if enabled
      let solcVersion = null;
      if (this.autoSelectVersion) {
        try {
          // Get required Solidity version from contract files
          const requiredVersion = await this.detectRequiredSolcVersion(sourceDir, mainFile);
          
          if (requiredVersion) {
            // Get current solc version
            const currentVersion = await this.getCurrentSolcVersion();
            
            // Check if version switch is needed
            if (currentVersion !== requiredVersion) {
              const consoleOutput = require('../utils/consoleOutput');
              consoleOutput.versionSwitch(currentVersion || 'none', requiredVersion);
              await this.switchSolcVersion(requiredVersion);
              solcVersion = requiredVersion;
              this.originalSolcVersion = currentVersion; // Store for restoration
            } else {
              logger.debug(`✅ Solidity version ${requiredVersion} already active`);
              solcVersion = requiredVersion;
            }
          }
        } catch (error) {
          logger.warn(`Failed to auto-select Solidity version: ${error.message}`);
          // Continue with current version
        }
      }

      // Run Slither
      const rawOutput = await this.runSlither(targetPath);
      
      // Restore original Solidity version if needed
      if (this.autoSelectVersion && this.restoreVersion && this.originalSolcVersion !== null && solcVersion !== this.originalSolcVersion) {
        try {
          logger.debug(`🔄 Restoring Solidity version: ${solcVersion} → ${this.originalSolcVersion}`);
          await this.switchSolcVersion(this.originalSolcVersion);
        } catch (error) {
          logger.warn(`Failed to restore Solidity version: ${error.message}`);
        }
        this.originalSolcVersion = null; // Reset
      }
      
      // Parse results
      const result = this.parseOutput(rawOutput);
      
      const duration = Date.now() - startTime;
      // Log completion (detailed summary handled by auditManager)
      logger.debug(`Slither audit completed in ${duration}ms - Found ${result.findings.length} issues`);
      
      return {
        ...result,
        metadata: {
          ...result.metadata,
          contractAddress,
          sourceDir,
          targetPath,
          solcVersion: solcVersion || 'default',
          duration
        }
      };
      
    } catch (error) {
      // Restore original version on error
      if (this.autoSelectVersion && this.restoreVersion && this.originalSolcVersion !== null) {
        try {
          await this.switchSolcVersion(this.originalSolcVersion);
        } catch (restoreError) {
          logger.warn(`Failed to restore Solidity version after error: ${restoreError.message}`);
        }
        this.originalSolcVersion = null;
      }
      
      logger.error(`Slither audit failed: ${error.message}`);
      return this.createResult({
        success: false,
        error: error.message,
        metadata: {
          contractAddress,
          sourceDir,
          duration: Date.now() - startTime
        }
      });
    }
  }

  /**
   * Run Slither on target path
   * @param {string} targetPath - Path to contract file or directory
   * @returns {Promise<Object>}
   */
  async runSlither(targetPath) {
    const fs = require('fs').promises;
    const crypto = require('crypto');
    
    // Create a temporary JSON output file
    const tmpDir = path.dirname(targetPath);
    const tmpFile = path.join(tmpDir, `slither_${crypto.randomBytes(8).toString('hex')}.json`);
    
    return new Promise((resolve, reject) => {
      // Slither arguments
      // Only check arbitrary-send-erc20 detector
      const args = [
        '--json', tmpFile,  // Output JSON to file
        '--solc-disable-warnings',  // Reduce noise
        '--exclude-dependencies',  // Don't analyze imported libraries
        '--detect', 'arbitrary-send-erc20',  // Only check arbitrary-send-erc20 detector
        ...this.additionalArgs,
        path.basename(targetPath)  // Target file/directory
      ];

      logger.debug(`Running: ${this.slitherPath} ${args.join(' ')}`);
      logger.debug(`CWD: ${tmpDir}`);

      const slitherProcess = spawn(this.slitherPath, args, {
        cwd: tmpDir,
        timeout: this.timeout
      });

      let stdout = '';
      let stderr = '';

      slitherProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      slitherProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      slitherProcess.on('close', async (code) => {
        // Slither returns non-zero exit code (255) when issues are found
        // So we don't treat non-zero as error
        try {
          // Read JSON from file
          const jsonContent = await fs.readFile(tmpFile, 'utf8');
          const jsonOutput = JSON.parse(jsonContent);
          
          // Clean up temp file
          await fs.unlink(tmpFile).catch(() => {});
          
          logger.debug(`Slither completed with exit code ${code}, found ${jsonOutput.results?.detectors?.length || 0} detectors`);
          resolve(jsonOutput);
          
        } catch (error) {
          // Clean up temp file
          await fs.unlink(tmpFile).catch(() => {});
          
          // Check if it's a compilation error
          if (stderr.includes('InvalidCompilation') || stderr.includes('Error: Source file requires different compiler version')) {
            logger.error('Slither compilation failed - wrong Solidity version');
            reject(new Error('Compilation failed: Solidity version mismatch. Check solc-select.'));
          } else if (stderr.includes('ERROR') || stderr.includes('Error:')) {
            reject(new Error(`Slither error: ${stderr.substring(0, 500)}`));
          } else {
            // Failed to read JSON, but might be because no issues found
            logger.debug('Failed to parse Slither JSON output, assuming no issues found');
            resolve({ success: true, results: { detectors: [] } });
          }
        }
      });

      slitherProcess.on('error', async (error) => {
        // Clean up temp file
        await fs.unlink(tmpFile).catch(() => {});
        reject(new Error(`Failed to run Slither: ${error.message}`));
      });

      // Handle timeout
      setTimeout(async () => {
        slitherProcess.kill();
        await fs.unlink(tmpFile).catch(() => {});
        reject(new Error('Slither timeout'));
      }, this.timeout);
    });
  }

  /**
   * Parse Slither output into standardized format
   * @param {Object} rawOutput - Slither JSON output
   * @returns {Object}
   */
  parseOutput(rawOutput) {
    try {
      // Check if it's an error response
      if (rawOutput.error) {
        return this.createResult({
          success: false,
          error: rawOutput.error,
          rawOutput
        });
      }

      // Extract detectors (findings)
      const detectors = rawOutput.results?.detectors || [];
      
      const findings = detectors.map(detector => ({
        id: detector.check || 'unknown',
        title: detector.description || 'No description',
        description: detector.markdown || detector.description || '',
        severity: this.mapSeverity(detector.impact),
        confidence: detector.confidence || 'unknown',
        locations: this.extractLocations(detector.elements),
        tool: 'Slither',
        rawData: detector
      }));

      return this.createResult({
        success: true,
        findings,
        metadata: {
          detectorCount: detectors.length,
          version: rawOutput.version || 'unknown'
        },
        rawOutput
      });
      
    } catch (error) {
      logger.error(`Failed to parse Slither output: ${error.message}`);
      return this.createResult({
        success: false,
        error: `Parse error: ${error.message}`,
        rawOutput
      });
    }
  }

  /**
   * Map Slither severity to standardized severity
   * @param {string} impact - Slither impact level
   * @returns {string}
   */
  mapSeverity(impact) {
    const severityMap = {
      'High': 'high',
      'Medium': 'medium',
      'Low': 'low',
      'Informational': 'info',
      'Optimization': 'info'
    };
    return severityMap[impact] || 'unknown';
  }

  /**
   * Extract source code locations from detector elements
   * @param {Array} elements - Detector elements
   * @returns {Array}
   */
  extractLocations(elements = []) {
    return elements
      .filter(el => el.source_mapping)
      .map(el => ({
        file: el.source_mapping.filename_short || el.source_mapping.filename_absolute,
        lines: el.source_mapping.lines || [],
        startLine: el.source_mapping.lines?.[0],
        endLine: el.source_mapping.lines?.[el.source_mapping.lines.length - 1],
      }));
  }

  /**
   * Detect required Solidity version from contract source files
   * @param {string} sourceDir - Source directory
   * @param {string} mainFile - Main contract file (optional)
   * @returns {Promise<string|null>} Solidity version (e.g., "0.8.19") or null
   */
  async detectRequiredSolcVersion(sourceDir, mainFile = null) {
    try {
      // If mainFile is specified, check that file first
      if (mainFile) {
        const mainFilePath = path.join(sourceDir, mainFile);
        try {
          const version = await this.parsePragmaVersion(mainFilePath);
          if (version) return version;
        } catch (error) {
          // File not found or error, continue to directory scan
        }
      }

      // Scan all .sol files in directory
      const files = await this.getAllSolFiles(sourceDir);
      
      const versions = new Set();
      for (const file of files) {
        try {
          const version = await this.parsePragmaVersion(file);
          if (version) {
            versions.add(version);
          }
        } catch (error) {
          // Skip files that can't be read
          continue;
        }
      }

      if (versions.size === 0) {
        return null;
      }

      if (versions.size === 1) {
        return Array.from(versions)[0];
      }

      // Multiple versions found - use the highest (most recent)
      const sortedVersions = Array.from(versions).sort((a, b) => {
        const aParts = a.split('.').map(Number);
        const bParts = b.split('.').map(Number);
        
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
          const aPart = aParts[i] || 0;
          const bPart = bParts[i] || 0;
          if (aPart !== bPart) {
            return bPart - aPart; // Descending order
          }
        }
        return 0;
      });

      logger.debug(`Multiple Solidity versions detected: ${Array.from(versions).join(', ')}. Using highest: ${sortedVersions[0]}`);
      return sortedVersions[0];
    } catch (error) {
      logger.debug(`Failed to detect Solidity version: ${error.message}`);
      return null;
    }
  }

  /**
   * Parse pragma solidity version from a file
   * @param {string} filePath - Path to .sol file
   * @returns {Promise<string|null>} Version string (e.g., "0.8.19") or null
   */
  async parsePragmaVersion(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      
      // Match pragma solidity statements
      // Examples:
      // pragma solidity ^0.8.0;
      // pragma solidity >=0.6.0 <0.9.0;
      // pragma solidity =0.8.19;
      // pragma solidity 0.8.0;
      const pragmaRegex = /pragma\s+solidity\s+([^;]+);/gi;
      const matches = Array.from(content.matchAll(pragmaRegex));
      
      if (matches.length === 0) {
        return null;
      }

      // Process all pragma statements and extract versions
      const versions = [];
      for (const match of matches) {
        const pragmaSpec = match[1].trim();
        
        // Handle different pragma formats
        // =0.8.19 (exact)
        const exactMatch = pragmaSpec.match(/^=(\d+\.\d+\.\d+)$/);
        if (exactMatch) {
          versions.push(exactMatch[1]);
          continue;
        }

        // ^0.8.0 (caret - compatible)
        const caretMatch = pragmaSpec.match(/^\^(\d+\.\d+\.\d+)$/);
        if (caretMatch) {
          versions.push(caretMatch[1]);
          continue;
        }

        // >=0.6.0 <0.9.0 (range)
        const rangeMatch = pragmaSpec.match(/>=\s*(\d+\.\d+\.\d+)\s*<\s*(\d+\.\d+\.\d+)/);
        if (rangeMatch) {
          // Get available versions and select the highest one within the range
          const lower = rangeMatch[1];
          const upper = rangeMatch[2];
          const selectedVersion = await this.selectVersionFromRange(lower, upper);
          if (selectedVersion) {
            versions.push(selectedVersion);
          }
          continue;
        }

        // >=0.8.0 (minimum)
        const minMatch = pragmaSpec.match(/^>=\s*(\d+\.\d+\.\d+)$/);
        if (minMatch) {
          versions.push(minMatch[1]);
          continue;
        }

        // 0.8.0 (simple version)
        const simpleMatch = pragmaSpec.match(/^(\d+\.\d+\.\d+)$/);
        if (simpleMatch) {
          versions.push(simpleMatch[1]);
          continue;
        }
      }

      if (versions.length === 0) {
        return null;
      }

      // Return the highest version found in this file
      const sorted = versions.sort((a, b) => {
        const aParts = a.split('.').map(Number);
        const bParts = b.split('.').map(Number);
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
          const aPart = aParts[i] || 0;
          const bPart = bParts[i] || 0;
          if (aPart !== bPart) {
            return bPart - aPart;
          }
        }
        return 0;
      });

      return sorted[0];
    } catch (error) {
      logger.debug(`Failed to parse pragma from ${filePath}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get all .sol files in a directory recursively
   * @param {string} dir - Directory path
   * @returns {Promise<Array<string>>} Array of file paths
   */
  async getAllSolFiles(dir) {
    const files = [];
    
    async function scan(currentDir) {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          
          if (entry.isDirectory()) {
            // Skip node_modules and other common ignore dirs
            if (!['node_modules', '.git', '.svn'].includes(entry.name)) {
              await scan(fullPath);
            }
          } else if (entry.isFile() && entry.name.endsWith('.sol')) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        // Ignore permission errors, etc.
      }
    }
    
    await scan(dir);
    return files;
  }

  /**
   * Get list of available Solidity versions from solc-select
   * @returns {Promise<Array<string>>} Array of version strings
   */
  async getAvailableVersions() {
    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      const solcSelectPath = this.solcSelectPath || 'solc-select';
      
      const solcSelectProcess = spawn(solcSelectPath, ['versions'], {
        env: process.env
      });
      
      let stdout = '';
      solcSelectProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      solcSelectProcess.on('close', () => {
        // Parse versions from output (one per line)
        const versions = stdout
          .split('\n')
          .map(line => line.trim())
          .filter(line => {
            // Match version pattern like "0.8.19" or "0.8.19 (current)"
            const match = line.match(/^(\d+\.\d+\.\d+)/);
            return match !== null;
          })
          .map(line => line.match(/^(\d+\.\d+\.\d+)/)[1]);
        
        resolve(versions);
      });
      
      solcSelectProcess.on('error', () => {
        // If solc-select fails, return empty array
        resolve([]);
      });
    });
  }

  /**
   * Select the highest available version within a range
   * @param {string} lower - Lower bound (e.g., "0.7.0")
   * @param {string} upper - Upper bound (exclusive, e.g., "0.8.0")
   * @returns {Promise<string|null>} Selected version or null
   */
  async selectVersionFromRange(lower, upper) {
    try {
      const availableVersions = await this.getAvailableVersions();
      
      if (availableVersions.length === 0) {
        // Fallback: use a reasonable version within the range
        const upperParts = upper.split('.').map(Number);
        if (upperParts[1] > 0) {
          // For >=0.7.0 <0.8.0, try 0.7.6 (last 0.7.x)
          const fallback = `${upperParts[0]}.${upperParts[1] - 1}.6`;
          logger.debug(`No available versions found, using fallback: ${fallback}`);
          return fallback;
        }
        return null;
      }
      
      // Filter versions within range
      const lowerParts = lower.split('.').map(Number);
      const upperParts = upper.split('.').map(Number);
      
      const validVersions = availableVersions.filter(version => {
        const parts = version.split('.').map(Number);
        
        // Check if version >= lower
        for (let i = 0; i < 3; i++) {
          if (parts[i] > lowerParts[i]) break;
          if (parts[i] < lowerParts[i]) return false;
        }
        
        // Check if version < upper
        for (let i = 0; i < 3; i++) {
          if (parts[i] < upperParts[i]) break;
          if (parts[i] >= upperParts[i]) return false;
        }
        
        return true;
      });
      
      if (validVersions.length === 0) {
        // No valid version found, use fallback
        const upperParts = upper.split('.').map(Number);
        if (upperParts[1] > 0) {
          // Try the last minor version before upper bound
          const lastMinor = availableVersions
            .filter(v => {
              const parts = v.split('.').map(Number);
              return parts[0] === upperParts[0] && parts[1] === upperParts[1] - 1;
            })
            .sort((a, b) => {
              const aParts = a.split('.').map(Number);
              const bParts = b.split('.').map(Number);
              return bParts[2] - aParts[2]; // Descending
            });
          
          if (lastMinor.length > 0) {
            logger.debug(`Using last available version in range: ${lastMinor[0]}`);
            return lastMinor[0];
          }
        }
        return null;
      }
      
      // Return the highest version
      const sorted = validVersions.sort((a, b) => {
        const aParts = a.split('.').map(Number);
        const bParts = b.split('.').map(Number);
        for (let i = 0; i < 3; i++) {
          if (aParts[i] !== bParts[i]) {
            return bParts[i] - aParts[i]; // Descending
          }
        }
        return 0;
      });
      
      logger.debug(`Selected version ${sorted[0]} from range >=${lower} <${upper}`);
      return sorted[0];
    } catch (error) {
      logger.debug(`Failed to select version from range: ${error.message}`);
      return null;
    }
  }

  /**
   * Get current active Solidity compiler version
   * @returns {Promise<string|null>} Version string or null
   */
  async getCurrentSolcVersion() {
    return new Promise((resolve, reject) => {
      // solc-select doesn't have a 'current' command
      // We need to check which version is active by checking solc version
      // or by checking the versions list and finding the active one
      const solcProcess = spawn('solc', ['--version']);
      
      let output = '';
      solcProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      solcProcess.stderr.on('data', (data) => {
        output += data.toString();
      });
      
      solcProcess.on('close', (code) => {
        if (code === 0 || output.includes('Version')) {
          // Extract version from output like "Version: 0.8.19+commit.7d6b4f96.Linux.g++"
          const versionMatch = output.match(/Version:\s*(\d+\.\d+\.\d+)/);
          if (versionMatch) {
            resolve(versionMatch[1]);
          } else {
            resolve(null);
          }
        } else {
          // solc not found or not configured
          resolve(null);
        }
      });
      
      solcProcess.on('error', (err) => {
        // solc not found, try checking solc-select versions
        const versionsProcess = spawn(this.solcSelectPath, ['versions']);
        
        let versionsOutput = '';
        versionsProcess.stdout.on('data', (data) => {
          versionsOutput += data.toString();
        });
        
        versionsProcess.stderr.on('data', (data) => {
          versionsOutput += data.toString();
        });
        
        versionsProcess.on('close', (versionsCode) => {
          // If solc-select is available, we can't determine current version easily
          // Return null and let the system handle it
          resolve(null);
        });
        
        versionsProcess.on('error', (versionsErr) => {
          // Neither solc nor solc-select found
          resolve(null);
        });
      });
    });
  }

  /**
   * Switch Solidity compiler version using solc-select
   * @param {string} version - Version to switch to (e.g., "0.8.19")
   * @returns {Promise<void>}
   */
  async switchSolcVersion(version) {
    return new Promise((resolve, reject) => {
      // First, try to install the version if not already installed
      const installProcess = spawn(this.solcSelectPath, ['install', version]);
      
      let installOutput = '';
      installProcess.stdout.on('data', (data) => {
        installOutput += data.toString();
      });
      
      installProcess.stderr.on('data', (data) => {
        installOutput += data.toString();
      });
      
      installProcess.on('close', (installCode) => {
        // Installation might fail if version already exists, that's OK
        // Now switch to the version
        const useProcess = spawn(this.solcSelectPath, ['use', version]);
        
        let useOutput = '';
        useProcess.stdout.on('data', (data) => {
          useOutput += data.toString();
        });
        
        useProcess.stderr.on('data', (data) => {
          useOutput += data.toString();
        });
        
        useProcess.on('close', (useCode) => {
          if (useCode === 0) {
            resolve();
          } else {
            // Check if it's just a warning about version already in use
            if (useOutput.includes('already in use') || useOutput.includes('already active')) {
              resolve();
            } else {
              reject(new Error(`Failed to switch to solc ${version}: ${useOutput}`));
            }
          }
        });
        
        useProcess.on('error', (err) => {
          reject(new Error(`solc-select not found. Install: pip3 install solc-select`));
        });
      });
      
      installProcess.on('error', (err) => {
        // If install fails, try use anyway (version might already be installed)
        const useProcess = spawn(this.solcSelectPath, ['use', version]);
        
        useProcess.on('close', (useCode) => {
          if (useCode === 0) {
            resolve();
          } else {
            reject(new Error(`Failed to switch to solc ${version}`));
          }
        });
        
        useProcess.on('error', (useErr) => {
          reject(new Error(`solc-select not found. Install: pip3 install solc-select`));
        });
      });
    });
  }
}

module.exports = SlitherAuditor;
