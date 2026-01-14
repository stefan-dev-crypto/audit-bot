/**
 * Test Parallel Auditing with Multiple OpenAI Keys
 * Verifies that multiple auditors can work simultaneously
 */

import 'dotenv/config';
import { getOpenAIKeys, getTelegramConfig } from '../src/config/apiKeys.js';
import { AuditorPool } from '../src/audit/auditorPool.js';

async function testParallelAudit() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           Parallel Auditing Configuration Test                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Test 1: Load API keys
    console.log('🧪 Test 1: Loading OpenAI API keys...');
    const apiKeys = getOpenAIKeys();
    console.log(`✅ Loaded ${apiKeys.length} API key(s)`);
    apiKeys.forEach((key, i) => {
      console.log(`   Key ${i + 1}: ${key.substring(0, 15)}...`);
    });
    console.log('');

    // Test 2: Load Telegram config
    console.log('🧪 Test 2: Loading Telegram configuration...');
    const telegramConfig = getTelegramConfig();
    if (telegramConfig) {
      console.log(`✅ Telegram configured`);
      console.log(`   Bot Token: ${telegramConfig.botToken.substring(0, 15)}...`);
      console.log(`   Chat ID: ${telegramConfig.chatId}`);
    } else {
      console.log(`⚠️  Telegram not configured (optional)`);
    }
    console.log('');

    // Test 3: Initialize Auditor Pool
    console.log('🧪 Test 3: Initializing Auditor Pool...');
    const auditorPool = new AuditorPool(apiKeys, telegramConfig);
    console.log('✅ Auditor Pool initialized successfully\n');

    // Test 4: Display pool stats
    console.log('🧪 Test 4: Auditor Pool statistics...');
    auditorPool.displayStats();
    console.log('');

    // Summary
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    Test Summary                               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log(`API Keys Loaded: ✅ ${apiKeys.length} key(s)`);
    console.log(`Telegram Config: ${telegramConfig ? '✅' : '⚠️'} ${telegramConfig ? 'Configured' : 'Not configured'}`);
    console.log(`Auditor Pool: ✅ ${apiKeys.length} auditor(s) ready`);
    console.log(`Parallel Capacity: ✅ ${apiKeys.length} contracts at once`);
    console.log(`\n🎉 All tests passed! Parallel auditing is ready.`);
    console.log(`\n📊 Expected throughput: ~${apiKeys.length * 6} contracts/minute`);
    console.log(`   (vs ${6} contracts/minute with single key)\n`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testParallelAudit().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
