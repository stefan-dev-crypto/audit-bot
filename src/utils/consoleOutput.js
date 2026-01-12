/**
 * Optimized Console Output Utility
 * Provides clean, organized, and visually appealing console output
 */

class ConsoleOutput {
  constructor() {
    this.silent = process.env.SILENT === 'true';
    this.verbose = process.env.VERBOSE === 'true';
    this.colors = {
      reset: '\x1b[0m',
      bright: '\x1b[1m',
      dim: '\x1b[2m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
      white: '\x1b[37m',
    };
  }

  /**
   * Print a section header
   */
  section(title, emoji = '📋') {
    if (this.silent) return;
    console.log(`\n${this.colors.cyan}${this.colors.bright}${emoji} ${title}${this.colors.reset}`);
    console.log(`${this.colors.dim}${'─'.repeat(60)}${this.colors.reset}`);
  }

  /**
   * Print a success message
   */
  success(message, emoji = '✅') {
    if (this.silent) return;
    console.log(`${this.colors.green}${emoji} ${message}${this.colors.reset}`);
  }

  /**
   * Print a warning message
   */
  warn(message, emoji = '⚠️') {
    if (this.silent) return;
    console.log(`${this.colors.yellow}${emoji} ${message}${this.colors.reset}`);
  }

  /**
   * Print an error message
   */
  error(message, emoji = '❌') {
    if (this.silent) return;
    console.error(`${this.colors.red}${emoji} ${message}${this.colors.reset}`);
  }

  /**
   * Print an info message
   */
  info(message, emoji = 'ℹ️') {
    if (this.silent) return;
    console.log(`${this.colors.blue}${emoji} ${message}${this.colors.reset}`);
  }

  /**
   * Print a debug message (only in verbose mode)
   */
  debug(message) {
    if (this.silent || !this.verbose) return;
    console.log(`${this.colors.dim}🔍 ${message}${this.colors.reset}`);
  }

  /**
   * Print a key-value pair
   */
  keyValue(key, value, indent = 0) {
    if (this.silent) return;
    const indentStr = ' '.repeat(indent);
    const formattedValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : value;
    console.log(`${indentStr}${this.colors.dim}${key}:${this.colors.reset} ${formattedValue}`);
  }

  /**
   * Print a table row
   */
  tableRow(cells, widths = []) {
    if (this.silent) return;
    const padded = cells.map((cell, i) => {
      const width = widths[i] || 20;
      const str = String(cell).substring(0, width);
      return str.padEnd(width);
    });
    console.log(`  ${padded.join(' │ ')}`);
  }

  /**
   * Print approval event in a clean format
   */
  approvalEvent(eventData, symbol) {
    if (this.silent) return;
    
    console.log(`\n${this.colors.cyan}${this.colors.bright}📝 Approval Event Detected${this.colors.reset}`);
    console.log(`${this.colors.dim}${'─'.repeat(60)}${this.colors.reset}`);
    
    this.keyValue('Token', `${symbol} (${this.shortenAddress(eventData.tokenAddress)})`, 2);
    this.keyValue('Owner', `${this.shortenAddress(eventData.owner)} [${this.getAddressTypeLabel(eventData.ownerIsContract)}]`, 2);
    this.keyValue('Spender', `${this.shortenAddress(eventData.spender)} [${this.getAddressTypeLabel(eventData.spenderIsContract)}]`, 2);
    this.keyValue('Amount', this.formatAmount(eventData.amount), 2);
    this.keyValue('Block', `#${eventData.blockNumber}`, 2);
    this.keyValue('Tx Hash', this.shortenHash(eventData.transactionHash), 2);
    
    console.log();
  }

  /**
   * Print audit start
   */
  auditStart(contractAddress) {
    if (this.silent) return;
    console.log(`\n${this.colors.magenta}${this.colors.bright}🔍 Auditing Contract${this.colors.reset}`);
    console.log(`${this.colors.dim}${'─'.repeat(60)}${this.colors.reset}`);
    this.keyValue('Address', contractAddress, 2);
  }

  /**
   * Print audit progress
   */
  auditProgress(auditor, status) {
    if (this.silent) return;
    const statusEmoji = status === 'running' ? '⏳' : status === 'done' ? '✅' : '❌';
    const statusColor = status === 'running' ? this.colors.yellow : status === 'done' ? this.colors.green : this.colors.red;
    console.log(`  ${statusColor}${statusEmoji} ${auditor}${this.colors.reset}`);
  }

  /**
   * Print audit summary
   */
  auditSummary(results) {
    if (this.silent) return;
    
    const { summary, duration } = results;
    
    console.log(`\n${this.colors.green}${this.colors.bright}✅ Audit Complete${this.colors.reset}`);
    console.log(`${this.colors.dim}${'─'.repeat(60)}${this.colors.reset}`);
    
    this.keyValue('Duration', `${(duration / 1000).toFixed(2)}s`, 2);
    this.keyValue('Total Findings', summary.totalFindings, 2);
    
    if (summary.totalFindings > 0) {
      console.log(`\n  ${this.colors.bright}Findings by Severity:${this.colors.reset}`);
      if (summary.criticalFindings > 0) {
        this.keyValue('🔴 Critical', summary.criticalFindings, 4);
      }
      if (summary.highFindings > 0) {
        this.keyValue('🟠 High', summary.highFindings, 4);
      }
      if (summary.mediumFindings > 0) {
        this.keyValue('🟡 Medium', summary.mediumFindings, 4);
      }
      if (summary.lowFindings > 0) {
        this.keyValue('🟢 Low', summary.lowFindings, 4);
      }
      if (summary.infoFindings > 0) {
        this.keyValue('ℹ️  Info', summary.infoFindings, 4);
      }
    } else {
      console.log(`  ${this.colors.green}No vulnerabilities detected${this.colors.reset}`);
    }
    
    console.log();
  }

  /**
   * Print system initialization
   */
  systemInit(components) {
    if (this.silent) return;
    
    console.log(`\n${this.colors.cyan}${this.colors.bright}🚀 Starting Audit Bot${this.colors.reset}`);
    console.log(`${this.colors.dim}${'─'.repeat(60)}${this.colors.reset}`);
    
    components.forEach(comp => {
      const status = comp.enabled ? '✅' : '❌';
      const color = comp.enabled ? this.colors.green : this.colors.red;
      console.log(`  ${color}${status} ${comp.name}${this.colors.reset}`);
      if (comp.details && this.verbose) {
        comp.details.forEach(detail => {
          this.keyValue('  ', detail, 4);
        });
      }
    });
    
    console.log();
  }

  /**
   * Print monitoring status
   */
  monitoringStatus(tokenCount) {
    if (this.silent) return;
    console.log(`${this.colors.green}✅ Monitoring ${tokenCount} token(s)${this.colors.reset}`);
    console.log(`${this.colors.dim}Press Ctrl+C to stop${this.colors.reset}\n`);
  }

  /**
   * Print version switch
   */
  versionSwitch(from, to) {
    if (this.silent || !this.verbose) return;
    console.log(`  ${this.colors.yellow}📦 Solidity: ${from || 'none'} → ${to}${this.colors.reset}`);
  }

  /**
   * Print file operations
   */
  fileSaved(type, path) {
    if (this.silent || !this.verbose) return;
    const emoji = type === 'report' ? '📄' : type === 'json' ? '💾' : '📊';
    console.log(`  ${this.colors.dim}${emoji} ${type} saved${this.colors.reset}`);
  }

  /**
   * Helper: Shorten address
   */
  shortenAddress(address) {
    if (!address) return 'N/A';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  /**
   * Helper: Shorten hash
   */
  shortenHash(hash) {
    if (!hash) return 'N/A';
    return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
  }

  /**
   * Helper: Format amount
   */
  formatAmount(amount) {
    if (!amount) return '0';
    try {
      const num = BigInt(amount);
      if (num === 0n) return '0';
      // Format large numbers
      const str = num.toString();
      if (str.length > 18) {
        return `${str.slice(0, -18)}.${str.slice(-18, -15)}... ETH`;
      }
      return str;
    } catch {
      return String(amount);
    }
  }

  /**
   * Helper: Get address type label
   */
  getAddressTypeLabel(isContract) {
    if (isContract === null || isContract === undefined) return 'Unknown';
    return isContract ? 'Contract' : 'Wallet';
  }

  /**
   * Print a separator line
   */
  separator() {
    if (this.silent) return;
    console.log(`${this.colors.dim}${'─'.repeat(60)}${this.colors.reset}`);
  }

  /**
   * Print empty line
   */
  blank() {
    if (this.silent) return;
    console.log();
  }
}

module.exports = new ConsoleOutput();
