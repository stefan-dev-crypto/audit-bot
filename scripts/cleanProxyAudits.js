/**
 * Clean Proxy Contract Audit Results
 * Removes audit results for proxy contracts (generic/repetitive results)
 */

import fs from 'fs';
import path from 'path';

function cleanProxyAudits() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         Clean Proxy Contract Audit Results                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const auditResultsDir = path.join(process.cwd(), 'audit-results');
  const auditedContractsFile = path.join(process.cwd(), 'data', 'audited-contracts.json');

  if (!fs.existsSync(auditResultsDir)) {
    console.log('❌ audit-results directory not found');
    return;
  }

  if (!fs.existsSync(auditedContractsFile)) {
    console.log('❌ audited-contracts.json not found');
    return;
  }

  // Load audited contracts
  const auditedData = JSON.parse(fs.readFileSync(auditedContractsFile, 'utf8'));

  // Patterns that indicate proxy contract audits
  const proxyPatterns = [
    /Unrestricted.*Upgrade/i,
    /Arbitrary Storage Write/i,
    /Unrestricted Storage Write/i,
    /delegatecall.*implementation/i,
    /setCode.*arbitrary/i,
    /setStorage.*slot/i,
  ];

  let cleaned = 0;
  let kept = 0;

  // Get all audit result files
  const files = fs.readdirSync(auditResultsDir).filter(f => f.endsWith('_audit.txt'));

  console.log(`Found ${files.length} audit result files\n`);

  for (const file of files) {
    const filePath = path.join(auditResultsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    // Check if file matches proxy patterns
    const isProxyAudit = proxyPatterns.some(pattern => pattern.test(content));

    if (isProxyAudit) {
      // Extract contract address from filename
      const match = file.match(/_([0-9a-fx]+)_audit\.txt$/i);
      if (match) {
        const address = match[1].toLowerCase();
        
        // Update audited-contracts.json
        if (auditedData[address]) {
          auditedData[address] = {
            hasVulnerabilities: false,
            vulnerabilities: [],
            auditedAt: new Date().toISOString(),
            failed: false,
            errorMessage: 'Skipped: Proxy contract - generic delegatecall pattern audit not useful'
          };
        }
      }

      // Delete the file
      fs.unlinkSync(filePath);
      console.log(`🗑️  Deleted: ${file}`);
      cleaned++;
    } else {
      kept++;
    }
  }

  // Save updated audited-contracts.json
  fs.writeFileSync(
    auditedContractsFile,
    JSON.stringify(auditedData, null, 2),
    'utf8'
  );

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    Cleanup Summary                            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`Total files: ${files.length}`);
  console.log(`Proxy audits deleted: 🗑️  ${cleaned}`);
  console.log(`Non-proxy audits kept: ✅ ${kept}`);
  console.log(`\n✅ audited-contracts.json updated\n`);
}

cleanProxyAudits();
