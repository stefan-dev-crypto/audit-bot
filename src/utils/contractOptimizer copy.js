/**
 * Contract Source Code Optimizer
 * Removes unnecessary code to reduce token usage for AI auditing
 */

import { cleanPragmaStatements } from './contractValidator.js';

/**
 * Optimize Solidity source code by removing unnecessary elements
 * @param {string} sourceCode - Raw Solidity source code
 * @returns {string} Optimized source code
 */
export function optimizeContractSource(sourceCode) {
  let optimized = sourceCode;
  
  // 0. Clean pragma statements (remove duplicates/mismatches)
  optimized = cleanPragmaStatements(optimized);
  
  // 1. Remove single-line comments (// ...)
  optimized = optimized.replace(/\/\/.*$/gm, '');
  
  // 2. Remove multi-line comments (/* ... */)
  optimized = optimized.replace(/\/\*[\s\S]*?\*\//g, '');
  
  // 3. Remove NatSpec documentation (@notice, @dev, @param, @return, etc.)
  // Already removed by step 2 since NatSpec is in comments
  
  // 4. Remove import statements for common libraries (they're not the audit target)
  const commonLibraries = [
    '@openzeppelin',
    'SafeMath',
    'Address',
    'Context',
    'IERC20',
    'ERC20',
    'Ownable',
    'Pausable',
    'ReentrancyGuard',
    'SafeERC20',
    'Math',
    'SignedMath',
    'Strings',
    'Arrays',
  ];
  
  for (const lib of commonLibraries) {
    const importRegex = new RegExp(`import\\s+.*${lib}.*?;`, 'gi');
    optimized = optimized.replace(importRegex, '');
  }
  
  // 5. Remove interface declarations (they don't contain logic)
  optimized = optimized.replace(/interface\s+\w+\s*\{[^}]*\}/gs, '');
  
  // 6. Remove library declarations (SafeMath, etc.)
  optimized = optimized.replace(/library\s+\w+\s*\{[\s\S]*?\n\}/gs, '');
  
  // 7. Remove ALL view/pure functions (they don't modify state or handle funds)
  // These functions cannot cause vulnerabilities related to fund theft
  
  // Pattern 1: function name(...) visibility view/pure ... { ... }
  optimized = optimized.replace(
    /function\s+\w+\s*\([^)]*\)\s+(?:public|external|internal)\s+(?:view|pure)\s+[^{]*\{[^}]*\}/gs,
    ''
  );
  
  // Pattern 2: function name(...) view/pure ... { ... }
  optimized = optimized.replace(
    /function\s+\w+\s*\([^)]*\)\s+(?:view|pure)\s+[^{]*\{[^}]*\}/gs,
    ''
  );
  
  // Pattern 3: Multi-line view/pure functions with nested braces
  let previousLength = 0;
  while (previousLength !== optimized.length) {
    previousLength = optimized.length;
    optimized = optimized.replace(
      /function\s+\w+\s*\([^)]*\)\s+[^{]*?\b(?:view|pure)\b[^{]*?\{(?:[^{}]|\{[^}]*\})*\}/gs,
      ''
    );
  }
  
  // 8. Remove empty lines (more than 2 consecutive)
  optimized = optimized.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  // 9. Remove leading/trailing whitespace from each line
  optimized = optimized
    .split('\n')
    .map(line => line.trim())
    .join('\n');
  
  // 10. Remove multiple consecutive empty lines
  optimized = optimized.replace(/\n{3,}/g, '\n\n');
  
  return optimized.trim();
}

/**
 * Extract only critical functions that can modify state or handle funds
 * @param {string} sourceCode - Optimized Solidity source code
 * @returns {string} Code with only critical functions
 */
export function extractCriticalFunctions(sourceCode) {
  const lines = sourceCode.split('\n');
  const result = [];
  let inCriticalFunction = false;
  let braceCount = 0;
  let currentFunction = [];
  let skipFunction = false;
  
  for (const line of lines) {
    // Check if this is a function declaration
    const isFunctionDeclaration = /function\s+\w+/.test(line);
    
    // Skip if it's a view or pure function
    if (isFunctionDeclaration && (/\bview\b/.test(line) || /\bpure\b/.test(line))) {
      skipFunction = true;
      inCriticalFunction = false;
      continue;
    }
    
    // Check if it's a state-modifying function
    const isStateModifying = 
      !line.includes('view') && 
      !line.includes('pure') &&
      (line.includes('public') || line.includes('external') || line.includes('internal') || line.includes('private'));
    
    // Check for critical keywords
    const hasCriticalKeywords = 
      line.includes('payable') ||
      line.includes('transfer') ||
      line.includes('send') ||
      line.includes('call') ||
      line.includes('delegatecall') ||
      line.includes('selfdestruct') ||
      line.includes('suicide') ||
      line.includes('.value') ||
      line.includes('withdraw') ||
      line.includes('mint') ||
      line.includes('burn') ||
      line.includes('approve') ||
      line.includes('transferFrom');
    
    if (isFunctionDeclaration && (isStateModifying || hasCriticalKeywords)) {
      inCriticalFunction = true;
      skipFunction = false;
      braceCount = 0;
    }
    
    if (skipFunction) {
      // Count braces even when skipping to know when function ends
      braceCount += (line.match(/\{/g) || []).length;
      braceCount -= (line.match(/\}/g) || []).length;
      
      if (braceCount === 0) {
        skipFunction = false;
      }
      continue;
    }
    
    if (inCriticalFunction) {
      currentFunction.push(line);
      
      // Count braces to know when function ends
      braceCount += (line.match(/\{/g) || []).length;
      braceCount -= (line.match(/\}/g) || []).length;
      
      if (braceCount === 0 && currentFunction.length > 1) {
        result.push(...currentFunction);
        result.push(''); // Add empty line between functions
        currentFunction = [];
        inCriticalFunction = false;
      }
    } else {
      // Keep contract declarations, pragmas, state variables, events, modifiers
      const trimmed = line.trim();
      if (
        line.includes('pragma') ||
        line.includes('contract ') ||
        line.includes('abstract contract') ||
        line.includes('interface ') ||
        trimmed.startsWith('event ') ||
        trimmed.startsWith('modifier ') ||
        line.includes('mapping') ||
        line.includes('struct ') ||
        line.includes('enum ') ||
        (line.includes('address') && line.includes(';')) ||
        (line.includes('uint') && line.includes(';')) ||
        (line.includes('int256') && line.includes(';')) ||
        (line.includes('bool') && line.includes(';')) ||
        (line.includes('bytes') && line.includes(';')) ||
        (line.includes('string') && line.includes(';'))
      ) {
        result.push(line);
      }
    }
  }
  
  return result.join('\n');
}

/**
 * Get estimated token count for source code
 * @param {string} sourceCode - Source code
 * @returns {number} Estimated token count
 */
export function estimateTokenCount(sourceCode) {
  // Rough estimation: 1 token ≈ 4 characters
  return Math.ceil(sourceCode.length / 4);
}

/**
 * Optimize contract source with multiple strategies
 * @param {string} sourceCode - Raw source code
 * @param {number} maxTokens - Maximum allowed tokens (default: 25000)
 * @returns {Object} { optimized: string, originalTokens: number, optimizedTokens: number }
 */
export function optimizeForAudit(sourceCode, maxTokens = 25000) {
  const originalTokens = estimateTokenCount(sourceCode);
  
  // Step 1: Remove comments and common libraries
  let optimized = optimizeContractSource(sourceCode);
  let currentTokens = estimateTokenCount(optimized);
  
  // Step 2: If still too large, extract only critical functions
  if (currentTokens > maxTokens) {
    optimized = extractCriticalFunctions(optimized);
    currentTokens = estimateTokenCount(optimized);
  }
  
  // Step 3: If STILL too large, truncate with warning
  if (currentTokens > maxTokens) {
    const maxChars = maxTokens * 4;
    optimized = optimized.slice(0, maxChars) + '\n\n// [TRUNCATED: Contract too large even after optimization]';
    currentTokens = maxTokens;
  }
  
  return {
    optimized,
    originalTokens,
    optimizedTokens: currentTokens,
    reductionPercent: ((1 - currentTokens / originalTokens) * 100).toFixed(1)
  };
}
