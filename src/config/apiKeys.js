/**
 * API Keys Configuration
 * Parses and manages multiple OpenAI API keys for parallel auditing
 */

import 'dotenv/config';

/**
 * Parse OpenAI API keys from environment
 * Supports both single key (OPENAI_API_KEY) and multiple keys (OPENAI_API_KEYS)
 * @returns {Array<string>} Array of OpenAI API keys
 */
export function getOpenAIKeys() {
  // Check for multiple keys first (comma-separated)
  if (process.env.OPENAI_API_KEYS) {
    const keys = process.env.OPENAI_API_KEYS
      .split(',')
      .map(key => key.trim())
      .filter(key => key.length > 0);
    
    if (keys.length > 0) {
      console.log(`✅ Loaded ${keys.length} OpenAI API key(s) for parallel auditing`);
      return keys;
    }
  }

  // Fallback to single key
  if (process.env.OPENAI_API_KEY) {
    console.log(`✅ Loaded 1 OpenAI API key`);
    return [process.env.OPENAI_API_KEY];
  }

  throw new Error('No OpenAI API keys found. Set OPENAI_API_KEYS or OPENAI_API_KEY in .env file');
}

/**
 * Get Telegram configuration
 * @returns {Object|null} Telegram config or null if not configured
 */
export function getTelegramConfig() {
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    return {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID,
    };
  }
  return null;
}
