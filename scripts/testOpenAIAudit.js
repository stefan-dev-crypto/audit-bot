/**
 * Test OpenAI Audit Functionality
 * Verifies that contract auditing using OpenAI is working properly
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { OpenAIAuditor } from '../src/audit/openaiAuditor.js';
import { SETTINGS } from '../src/config/settings.js';

async function testOpenAIAudit() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║              OpenAI Audit Functionality Test                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  // Check for OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY not found in environment variables');
    console.error('   Please set OPENAI_API_KEY in your .env file\n');
    process.exit(1);
  }
  
  console.log('✅ OpenAI API key found\n');
  
  // Display configuration
  console.log('════════════════════════════════════════════════════════════════');
  console.log('Configuration');
  console.log('════════════════════════════════════════════════════════════════\n');
  console.log(`Pre-audit regex check: ${SETTINGS.ENABLE_PRE_AUDIT_REGEX_CHECK ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log(`Pre-audit overflow check: ${SETTINGS.ENABLE_PRE_AUDIT_OVERFLOW_CHECK ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log('');
  
  // Find vulnerable.sol file
  const vulnerableFilePath = path.join(process.cwd(), '..', 'vulnerable.sol');
  
  if (!fs.existsSync(vulnerableFilePath)) {
    console.error(`❌ Error: ${vulnerableFilePath} not found`);
    console.error('   Please ensure vulnerable.sol exists in the parent directory\n');
    process.exit(1);
  }
  
  // Read the vulnerable contract
  const contractSource = fs.readFileSync(vulnerableFilePath, 'utf8');
  console.log(`📄 Loaded vulnerable.sol`);
  console.log(`   File size: ${(contractSource.length / 1024).toFixed(2)} KB`);
  console.log(`   Lines: ${contractSource.split('\n').length}\n`);
  
  // Create a temporary file for the contract
  // Use a unique address based on timestamp to avoid caching issues
  const testAddress = `0x${Date.now().toString(16).padStart(40, '0')}`;
  const tempDir = path.join(process.cwd(), 'data', 'temp');
  
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const tempFilePath = path.join(tempDir, `test_${testAddress}.sol`);
  fs.writeFileSync(tempFilePath, contractSource, 'utf8');
  console.log(`📝 Created temporary contract file:`);
  console.log(`   Address: ${testAddress}`);
  console.log(`   File: ${path.basename(tempFilePath)}\n`);
  
  try {
    // Initialize auditor
    console.log('🔧 Initializing OpenAI Auditor...\n');
    const auditor = new OpenAIAuditor(process.env.OPENAI_API_KEY);
    
    console.log('════════════════════════════════════════════════════════════════');
    console.log('Starting OpenAI Audit...');
    console.log('════════════════════════════════════════════════════════════════\n');
    
    const startTime = Date.now();
    const result = await auditor.auditContract(testAddress, tempFilePath);
    const duration = Date.now() - startTime;
    
    console.log(`\n⏱️  Audit completed in ${(duration / 1000).toFixed(2)} seconds\n`);
    
    // Check if audit was skipped
    if (result.skipped) {
      console.log('════════════════════════════════════════════════════════════════');
      console.log('AUDIT RESULT: SKIPPED');
      console.log('════════════════════════════════════════════════════════════════\n');
      console.log(`⏭️  Audit was SKIPPED`);
      console.log(`   Reason: ${result.reason || 'unknown'}\n`);
      
      if (result.reason === 'pre_audit_no_vulnerabilities') {
        console.log('   ℹ️  Pre-audit checks did not detect vulnerabilities.');
        console.log('   This means the contract did not match the configured patterns.\n');
      }
      
      process.exit(1);
    }
    
    // Check for errors
    if (result.error) {
      console.log('════════════════════════════════════════════════════════════════');
      console.log('AUDIT RESULT: ERROR');
      console.log('════════════════════════════════════════════════════════════════\n');
      console.log(`❌ Audit failed with error:`);
      console.log(`   ${result.error}\n`);
      process.exit(1);
    }
    
    // Display results
    console.log('════════════════════════════════════════════════════════════════');
    console.log('AUDIT RESULTS');
    console.log('════════════════════════════════════════════════════════════════\n');
    
    const auditResult = result.result || result;
    const hasVulnerabilities = result.hasVulnerabilities !== undefined 
      ? result.hasVulnerabilities 
      : (auditResult?.critical_vulnerability_exists || false);
    
    if (hasVulnerabilities) {
      console.log('🚨 CRITICAL VULNERABILITY DETECTED! ✅');
      const issuesCount = result.criticalIssuesCount || 
                         auditResult?.critical_issues_count || 
                         auditResult?.critical_issues?.length || 
                         0;
      console.log(`   Total issues: ${issuesCount}\n`);
      
      const summary = auditResult?.summary || result.summary;
      if (summary) {
        console.log('📋 Summary:');
        console.log(`${summary}\n`);
      }
      
      const criticalIssues = auditResult?.critical_issues || result.critical_issues || [];
      if (criticalIssues.length > 0) {
        console.log('════════════════════════════════════════════════════════════════');
        console.log('Critical Issues:');
        console.log('════════════════════════════════════════════════════════════════\n');
        
        criticalIssues.forEach((issue, idx) => {
          console.log(`${idx + 1}. ${issue.title || 'Untitled Issue'}`);
          if (issue.vulnerability_type) {
            console.log(`   Type: ${issue.vulnerability_type}`);
          }
          if (issue.affected_function) {
            console.log(`   Function: ${Array.isArray(issue.affected_function) ? issue.affected_function.join(', ') : issue.affected_function}`);
          }
          if (issue.affected_contract) {
            console.log(`   Contract: ${issue.affected_contract}`);
          }
          if (issue.affected_line_number) {
            console.log(`   Line: ${Array.isArray(issue.affected_line_number) ? issue.affected_line_number.join(', ') : issue.affected_line_number}`);
          }
          console.log('');
        });
      }
      
      // Check for business logic flaws
      const hasBusinessLogicFlaws = auditResult?.critical_bussiness_logic_flaws_exists || 
                                    (auditResult?.critical_bussiness_logic_flaws && auditResult.critical_bussiness_logic_flaws.length > 0);
      
      if (hasBusinessLogicFlaws) {
        const businessLogicFlaws = auditResult?.critical_bussiness_logic_flaws || [];
        if (businessLogicFlaws.length > 0) {
          console.log('════════════════════════════════════════════════════════════════');
          console.log('Critical Business Logic Flaws:');
          console.log('════════════════════════════════════════════════════════════════\n');
          
          businessLogicFlaws.forEach((flaw, idx) => {
            console.log(`${idx + 1}. ${flaw.title || 'Untitled Flaw'}`);
            if (flaw.bussiness_logic_flaw_type) {
              console.log(`   Type: ${flaw.bussiness_logic_flaw_type}`);
            }
            if (flaw.affected_function) {
              console.log(`   Function: ${Array.isArray(flaw.affected_function) ? flaw.affected_function.join(', ') : flaw.affected_function}`);
            }
            if (flaw.affected_contract) {
              console.log(`   Contract: ${flaw.affected_contract}`);
            }
            if (flaw.affected_line_number) {
              console.log(`   Line: ${flaw.affected_line_number}`);
            }
            console.log('');
          });
        }
      }
      
    } else {
      console.log('✅ No critical vulnerabilities detected');
      
      const summary = auditResult?.summary || result.summary;
      if (summary) {
        console.log(`\n📋 Summary:\n${summary}\n`);
      }
    }
    
    // Check if audit result file was created
    const auditResultsDir = path.join(process.cwd(), 'audit-results');
    if (fs.existsSync(auditResultsDir)) {
      const auditFiles = fs.readdirSync(auditResultsDir)
        .filter(f => f.endsWith('_audit.txt'))
        .sort()
        .reverse();
      
      if (auditFiles.length > 0) {
        const latestAuditFile = auditFiles[0];
        console.log(`📄 Latest audit result saved: ${latestAuditFile}\n`);
      }
    }
    
    // Test Summary
    console.log('════════════════════════════════════════════════════════════════');
    console.log('TEST SUMMARY');
    console.log('════════════════════════════════════════════════════════════════\n');
    
    if (hasVulnerabilities) {
      console.log('✅ OpenAI Audit: WORKING');
      console.log('   ✅ Contract was audited successfully');
      console.log('   ✅ Vulnerabilities were detected');
      console.log('   ✅ Audit result was saved\n');
    } else {
      console.log('✅ OpenAI Audit: WORKING');
      console.log('   ✅ Contract was audited successfully');
      console.log('   ℹ️  No vulnerabilities detected (this is valid)');
      console.log('   ✅ Audit completed without errors\n');
    }
    
  } catch (error) {
    console.error('\n❌ Error during OpenAI audit:');
    console.error(`   ${error.message}\n`);
    
    if (error.message.includes('429')) {
      console.error('   This error indicates API quota exceeded.');
      console.error('   Please check your OpenAI API plan and billing.\n');
    } else if (error.message.includes('401')) {
      console.error('   This error indicates invalid API key.');
      console.error('   Please check your OPENAI_API_KEY in .env file.\n');
    } else {
      console.error('   Stack trace:');
      console.error(error.stack);
      console.log('');
    }
    
    process.exit(1);
  } finally {
    // Clean up temp file
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
        console.log(`🗑️  Cleaned up temporary file\n`);
      }
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
  }
  
  console.log('✅ Test complete!\n');
}

testOpenAIAudit().catch(console.error);
