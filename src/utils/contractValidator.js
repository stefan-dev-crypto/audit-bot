/**
 * Contract Validator
 * Determines if a contract should be audited
 */

/**
 * Check if contract is Solidity (not Vyper, Yul, etc.)
 * @param {string} sourceCode - Contract source code
 * @returns {boolean} True if it's a Solidity contract
 */
export function isSolidityContract(sourceCode) {
  // Check for Vyper version marker
  if (sourceCode.includes('# @version') || sourceCode.includes('#@version')) {
    return false;
  }
  
  // Check for Yul syntax
  if (sourceCode.includes('object "') && sourceCode.includes('code {')) {
    return false;
  }
  
  // Check if it has Solidity pragma
  const hasSolidityPragma = /pragma\s+solidity/i.test(sourceCode);
  
  // Check if it has contract/interface/library declaration
  const hasContractDeclaration = /\b(contract|interface|library|abstract\s+contract)\s+\w+/i.test(sourceCode);
  
  return hasSolidityPragma || hasContractDeclaration;
}

/**
 * Detect contract language
 * @param {string} sourceCode - Contract source code
 * @returns {string} Language name (Solidity, Vyper, Yul, Unknown)
 */
export function detectContractLanguage(sourceCode) {
  if (sourceCode.includes('# @version') || sourceCode.includes('#@version')) {
    return 'Vyper';
  }
  
  if (sourceCode.includes('object "') && sourceCode.includes('code {')) {
    return 'Yul';
  }
  
  if (/pragma\s+solidity/i.test(sourceCode)) {
    return 'Solidity';
  }
  
  if (/\b(contract|interface|library)\s+\w+/i.test(sourceCode)) {
    return 'Solidity';
  }
  
  return 'Unknown';
}

/**
 * Check if contract should be audited
 * @param {string} sourceCode - Contract source code
 * @returns {Object} { shouldAudit: boolean, reason: string, language: string }
 */
export function shouldAuditContract(sourceCode) {
  const language = detectContractLanguage(sourceCode);
  
  // Only audit Solidity contracts
  if (language !== 'Solidity') {
    return {
      shouldAudit: false,
      reason: `Contract is written in ${language}, not Solidity`,
      language
    };
  }
  
  // Check if contract is too simple (less than 100 characters)
  if (sourceCode.trim().length < 100) {
    return {
      shouldAudit: false,
      reason: 'Contract too simple or empty',
      language
    };
  }
  
  return {
    shouldAudit: true,
    reason: 'Valid Solidity contract',
    language
  };
}

/**
 * Extract the main contract pragma version
 * @param {string} sourceCode - Contract source code
 * @returns {string|null} Main pragma version or null
 */
export function extractMainPragma(sourceCode) {
  const pragmaRegex = /pragma\s+solidity\s+([^;]+);/gi;
  const matches = [...sourceCode.matchAll(pragmaRegex)];
  
  if (matches.length === 0) {
    return null;
  }
  
  // Count occurrences of each pragma
  const pragmaCounts = {};
  matches.forEach(match => {
    const version = match[1].trim();
    pragmaCounts[version] = (pragmaCounts[version] || 0) + 1;
  });
  
  // Return the most common pragma
  const mostCommon = Object.entries(pragmaCounts)
    .sort((a, b) => b[1] - a[1])[0];
  
  return mostCommon ? mostCommon[0] : null;
}

/**
 * Remove duplicate or mismatched pragma statements
 * @param {string} sourceCode - Contract source code
 * @returns {string} Cleaned source code with single pragma
 */
export function cleanPragmaStatements(sourceCode) {
  const mainPragma = extractMainPragma(sourceCode);
  
  if (!mainPragma) {
    return sourceCode; // No pragma found, return as-is
  }
  
  // Remove all pragma statements
  let cleaned = sourceCode.replace(/pragma\s+solidity\s+[^;]+;/gi, '');
  
  // Add the main pragma at the beginning (after comments if any)
  const lines = cleaned.split('\n');
  let insertIndex = 0;
  
  // Skip initial comments and empty lines
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*')) {
      insertIndex = i;
      break;
    }
  }
  
  lines.splice(insertIndex, 0, `pragma solidity ${mainPragma};`);
  
  return lines.join('\n');
}
