/**
 * Test Telegram Notification Function
 * Tests if Telegram alerts are working properly
 */

import 'dotenv/config';
import { sendVulnerabilityAlert, sendTelegramMessage } from '../src/notifications/telegram.js';

async function testTelegram() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║              Telegram Notification Test                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken) {
    console.error('❌ TELEGRAM_BOT_TOKEN not found in .env file');
    process.exit(1);
  }

  if (!chatId) {
    console.error('❌ TELEGRAM_CHAT_ID not found in .env file');
    process.exit(1);
  }

  console.log(`📱 Bot Token: ${botToken.substring(0, 10)}...`);
  console.log(`💬 Chat ID: ${chatId}\n`);

  // Test 1: Simple message
  console.log('🧪 Test 1: Sending simple test message...');
  const simpleMessage = '🧪 <b>Test Message</b>\n\nThis is a test from the audit bot.';
  const test1Result = await sendTelegramMessage(botToken, chatId, simpleMessage);
  
  if (test1Result) {
    console.log('✅ Test 1 PASSED: Simple message sent successfully\n');
  } else {
    console.log('❌ Test 1 FAILED: Could not send simple message\n');
  }

  // Wait a bit before next test
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 2: Vulnerability alert
  console.log('🧪 Test 2: Sending vulnerability alert...');
  const testAddress = '0x1234567890123456789012345678901234567890';
  const testVulnerabilities = ['Reentrancy', 'Arbitrary External Call', 'Integer Overflow'];
  
  const test2Result = await sendVulnerabilityAlert(
    testAddress,
    testVulnerabilities,
    botToken,
    chatId
  );

  if (test2Result) {
    console.log('✅ Test 2 PASSED: Vulnerability alert sent successfully\n');
  } else {
    console.log('❌ Test 2 FAILED: Could not send vulnerability alert\n');
  }

  // Summary
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                      Test Summary                             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`Simple Message: ${test1Result ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Vulnerability Alert: ${test2Result ? '✅ PASSED' : '❌ FAILED'}`);
  
  if (test1Result && test2Result) {
    console.log('\n🎉 All tests passed! Check your Telegram channel for messages.');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Check the error messages above.');
    process.exit(1);
  }
}

testTelegram().catch(error => {
  console.error('❌ Test error:', error.message);
  process.exit(1);
});
