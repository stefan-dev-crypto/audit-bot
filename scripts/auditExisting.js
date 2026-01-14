import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { OpenAIAuditor } from '../src/audit/openaiAuditor.js';

/**
 * Script to audit all existing contract source files
 */
async function auditExistingContracts() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           Audit Existing Contracts with OpenAI                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  const sourcesDir = path.join(process.cwd(), 'data', 'sources');
  const auditor = new OpenAIAuditor();
  
  // Check if sources directory exists
  if (!fs.existsSync(sourcesDir)) {
    console.log('❌ No sources directory found. Please fetch contracts first.');
    process.exit(1);
  }
  
  // Get all .sol files
  const files = fs.readdirSync(sourcesDir)
    .filter(file => file.endsWith('.sol'))
    .sort();
  
  if (files.length === 0) {
    console.log('❌ No contract source files found.');
    process.exit(1);
  }
  
  console.log(`Found ${files.length} contract source files\n`);
  
  let audited = 0;
  let skipped = 0;
  let errors = 0;
  let vulnerabilitiesFound = 0;
  
  for (const file of files) {
    try {
      // Extract contract address from filename (format: {index}_{address}.sol)
      const match = file.match(/_([0-9a-fx]+)\.sol$/i);
      if (!match) {
        console.log(`⚠️  Skipping file with invalid name format: ${file}`);
        skipped++;
        continue;
      }
      
      const contractAddress = match[1];
      const filePath = path.join(sourcesDir, file);
      
      // Audit the contract
      const result = await auditor.auditContract(contractAddress, filePath);
      
      if (result.skipped) {
        skipped++;
      } else if (result.error) {
        errors++;
      } else {
        audited++;
        if (result.hasVulnerabilities) {
          vulnerabilitiesFound++;
          console.log(`      └─ 🚨 ${result.criticalIssuesCount} critical issue(s) found!`);
        }
      }
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
      errors++;
      
      // If rate limited, wait longer
      if (error.message.includes('Rate limited')) {
        console.log('⏳ Rate limited. Waiting 60 seconds...');
        await new Promise(resolve => setTimeout(resolve, 60000));
      }
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 AUDIT SUMMARY:');
  console.log(`   Total files:              ${files.length}`);
  console.log(`   Newly audited:            ${audited}`);
  console.log(`   Already audited (skipped): ${skipped}`);
  console.log(`   Errors:                   ${errors}`);
  console.log(`   Vulnerabilities found:    ${vulnerabilitiesFound}`);
  console.log('\n' + '='.repeat(80));
  
  if (vulnerabilitiesFound > 0) {
    console.log(`\n🚨 WARNING: ${vulnerabilitiesFound} contracts with critical vulnerabilities detected!`);
    console.log('   Check audit results in data/audit-results/ directory');
  }
  
  console.log('\n✅ Audit complete!');
}

// Run the script
auditExistingContracts().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
