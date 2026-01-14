/**
 * Test Audit Persistence
 * Verifies that contracts in audited-contracts.json are not re-audited
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { getOpenAIKeys, getTelegramConfig } from '../src/config/apiKeys.js';
import { AuditorPool } from '../src/audit/auditorPool.js';

async function testAuditPersistence() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           Audit Persistence Test                               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const auditedContractsFile = path.join(process.cwd(), 'data', 'audited-contracts.json');
  
  // Test 1: Check if audited-contracts.json exists
  console.log('🧪 Test 1: Checking audited-contracts.json file...');
  if (!fs.existsSync(auditedContractsFile)) {
    console.log('⚠️  audited-contracts.json not found (this is OK if no audits have been done yet)');
    console.log('✅ Test passed (no contracts to check)');
    return;
  }
  
  const data = fs.readFileSync(auditedContractsFile, 'utf8');
  const auditedData = JSON.parse(data);
  
  let contractAddresses = [];
  if (Array.isArray(auditedData)) {
    contractAddresses = auditedData;
  } else if (typeof auditedData === 'object') {
    contractAddresses = Object.keys(auditedData);
  }
  
  console.log(`✅ Found ${contractAddresses.length} audited contracts in file\n`);
  
  if (contractAddresses.length === 0) {
    console.log('✅ Test passed (no contracts to check)');
    return;
  }

  // Test 2: Initialize Auditor Pool
  console.log('🧪 Test 2: Initializing Auditor Pool...');
  const apiKeys = getOpenAIKeys();
  const telegramConfig = getTelegramConfig();
  const auditorPool = new AuditorPool(apiKeys, telegramConfig);
  console.log('✅ Auditor Pool initialized\n');

  // Test 3: Check if contracts are recognized as audited
  console.log('🧪 Test 3: Checking if contracts are recognized as audited...');
  const testAddresses = contractAddresses.slice(0, 5); // Test first 5
  
  let allRecognized = true;
  for (const address of testAddresses) {
    const isAudited = auditorPool.isAudited(address);
    const status = isAudited ? '✅' : '❌';
    console.log(`   ${status} ${address}: ${isAudited ? 'Recognized as audited' : 'NOT recognized (BUG!)'}`);
    if (!isAudited) {
      allRecognized = false;
    }
  }
  
  console.log('');
  
  // Test 4: Check a random non-audited address
  console.log('🧪 Test 4: Checking non-audited address (should return false)...');
  const testNonAudited = '0x1234567890123456789012345678901234567890';
  const isNonAuditedRecognized = auditorPool.isAudited(testNonAudited);
  if (!isNonAuditedRecognized) {
    console.log(`   ✅ ${testNonAudited}: Correctly recognized as NOT audited`);
  } else {
    console.log(`   ❌ ${testNonAudited}: Incorrectly recognized as audited (BUG!)`);
    allRecognized = false;
  }
  console.log('');

  // Summary
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    Test Summary                               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  
  if (allRecognized) {
    console.log('✅ ALL TESTS PASSED!');
    console.log(`   • ${testAddresses.length} audited contracts correctly recognized`);
    console.log('   • Non-audited contract correctly identified');
    console.log('   • Contracts will NOT be re-audited after restart\n');
  } else {
    console.log('❌ SOME TESTS FAILED!');
    console.log('   • Some audited contracts were not recognized');
    console.log('   • This could lead to duplicate audits\n');
    process.exit(1);
  }
}

testAuditPersistence().catch(error => {
  console.error('❌ Test error:', error.message);
  process.exit(1);
});
