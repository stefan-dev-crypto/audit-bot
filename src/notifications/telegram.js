/**
 * Telegram Notification Module
 * Sends notifications to a Telegram channel when critical vulnerabilities are found
 */

/**
 * Send a message to a Telegram channel
 * @param {string} botToken - Telegram bot token
 * @param {string} chatId - Telegram chat ID (channel or private chat)
 * @param {string} message - Message to send
 * @returns {Promise<boolean>} - Success status
 */
export async function sendTelegramMessage(botToken, chatId, message) {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    const data = await response.json();
    
    if (!data.ok) {
      console.error(`   ⚠️  Telegram API error: ${data.description}`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(`   ⚠️  Failed to send Telegram message: ${error.message}`);
    return false;
  }
}

/**
 * Send vulnerability alert to Telegram
 * @param {string} contractAddress - Contract address
 * @param {Array<string>} vulnerabilityNames - List of vulnerability types
 * @param {string} botToken - Telegram bot token
 * @param {string} chatId - Telegram chat ID
 */
export async function sendVulnerabilityAlert(contractAddress, vulnerabilityNames, botToken, chatId) {
  const chainName = "Ethereum";
  const vulnList = vulnerabilityNames.map(v => `• ${v}`).join('\n');
  
  const message = `🚨 <b>CRITICAL VULNERABILITY DETECTED</b> 🚨

🌐 <b>Chain:</b> <code>${chainName}</code>
📍 <b>Contract:</b> <code>${contractAddress}</code>

🔴 <b>Vulnerabilities Found:</b>
${vulnList}

⏰ <b>Time:</b> ${new Date().toISOString()}`;

  const success = await sendTelegramMessage(botToken, chatId, message);
  
  if (success) {
    console.log(`   📱 Telegram alert sent`);
  }
  
  return success;
}
