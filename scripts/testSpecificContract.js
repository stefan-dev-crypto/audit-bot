/**
 * Test specific contract address to verify it's recognized as audited
 */

import 'dotenv/config';
import { getOpenAIKeys, getTelegramConfig } from '../src/config/apiKeys.js';
import { AuditorPool } from '../src/audit/auditorPool.js';

async function testSpecificContract() {
  const testAddress = '0x3333333acdedbbc9ad7bda0876e60714195681c5';
  
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║        Testing Specific Contract Recognition                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`Testing contract: ${testAddress}\n`);
  
  const apiKeys = getOpenAIKeys();
  const telegramConfig = getTelegramConfig();
  const auditorPool = new AuditorPool(apiKeys, telegramConfig);
  
  // Test multiple times to check consistency
  for (let i = 1; i <= 5; i++) {
    const isAudited = auditorPool.isAudited(testAddress);
    const status = isAudited ? '✅' : '❌';
    console.log(`Check ${i}: ${status} ${isAudited ? 'Recognized as audited' : 'NOT recognized (BUG!)'}`);
  }
  
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    Test Summary                               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  
  const finalCheck = auditorPool.isAudited(testAddress);
  if (finalCheck) {
    console.log('✅ Contract is correctly recognized as audited');
    console.log('✅ Will NOT be re-audited\n');
  } else {
    console.log('❌ Contract is NOT recognized as audited');
    console.log('❌ This is a BUG - contract will be re-audited!\n');
    process.exit(1);
  }
}

testSpecificContract().catch(error => {
  console.error('❌ Test error:', error.message);
  process.exit(1);
});
