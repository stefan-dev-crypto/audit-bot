#!/usr/bin/env node

/**
 * Example: Using the audit system
 * 
 * This example demonstrates:
 * 1. Initializing the audit system
 * 2. Auditing a specific contract
 * 3. Getting audit results
 * 4. Checking auditor status
 */

const path = require('path');
const {
  initializeAuditManager,
  auditContract,
  getAuditResults,
  getAuditorsStatus
} = require('../utils/auditIntegration');

async function main() {
  console.log('🔍 Audit System Example\n');

  // 1. Initialize audit manager
  console.log('Step 1: Initializing audit manager...');
  await initializeAuditManager();
  console.log('✅ Initialized\n');

  // 2. Check auditor status
  console.log('Step 2: Checking auditor status...');
  const status = await getAuditorsStatus();
  console.log('Available auditors:');
  status.forEach(s => {
    const icon = s.available ? '✅' : '❌';
    console.log(`  ${icon} ${s.name} - ${s.available ? 'ready' : 'not available'}`);
  });
  console.log();

  // 3. Audit a contract (example - adjust paths as needed)
  const contractAddress = '0xa250cc729bb3323e7933022a67b52200fe354767';
  const sourceDir = path.resolve(__dirname, '../../sources', contractAddress.toLowerCase());

  console.log(`Step 3: Auditing contract ${contractAddress}...`);
  console.log(`Source directory: ${sourceDir}\n`);

  const results = await auditContract(contractAddress, sourceDir);

  if (results) {
    console.log('\n📊 Audit Results Summary:');
    console.log(`  Total Auditors: ${results.summary.totalAuditors}`);
    console.log(`  Successful: ${results.summary.successfulAudits}`);
    console.log(`  Failed: ${results.summary.failedAudits}`);
    console.log(`  Duration: ${results.duration}ms\n`);

    console.log('  Findings:');
    console.log(`    🔴 Critical: ${results.summary.criticalFindings}`);
    console.log(`    🟠 High: ${results.summary.highFindings}`);
    console.log(`    🟡 Medium: ${results.summary.mediumFindings}`);
    console.log(`    🔵 Low: ${results.summary.lowFindings}`);
    console.log(`    ℹ️  Info: ${results.summary.infoFindings}`);
    console.log();

    // Display individual auditor results
    for (const [auditorName, auditorResult] of Object.entries(results.auditors)) {
      console.log(`\n  ${auditorName} Results:`);
      if (auditorResult.success) {
        console.log(`    ✅ Success - ${auditorResult.findings.length} findings`);
        
        // Show first few findings as examples
        if (auditorResult.findings.length > 0) {
          console.log('    Top findings:');
          auditorResult.findings.slice(0, 3).forEach((finding, idx) => {
            console.log(`      ${idx + 1}. [${finding.severity.toUpperCase()}] ${finding.id}`);
            console.log(`         ${finding.title}`);
          });
          
          if (auditorResult.findings.length > 3) {
            console.log(`    ... and ${auditorResult.findings.length - 3} more`);
          }
        }
      } else {
        console.log(`    ❌ Failed: ${auditorResult.error}`);
      }
    }

    // 4. Get stored results
    console.log('\n\nStep 4: Retrieving stored results...');
    const storedResults = await getAuditResults(contractAddress, true);
    if (storedResults) {
      console.log(`✅ Found stored results from ${storedResults.timestamp}`);
    } else {
      console.log('No stored results found');
    }

  } else {
    console.log('⚠️  Audit returned no results (may be disabled in config)');
  }

  console.log('\n✅ Example complete!\n');
}

// Run example
if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

module.exports = { main };
