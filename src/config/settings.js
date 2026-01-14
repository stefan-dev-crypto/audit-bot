/**
 * Application settings and configuration
 */

export const SETTINGS = {
  // Processing mode: 'combined' or 'separate'
  // - 'combined': Fetch and audit immediately (saves disk space, no .sol files kept)
  // - 'separate': Fetch to .sol files, then audit separately (keeps .sol files)
  PROCESSING_MODE: process.env.PROCESSING_MODE || 'combined',
  
  // Etherscan API settings
  ETHERSCAN_RETRY_COUNT: 3,
  ETHERSCAN_RETRY_DELAY: 1000, // milliseconds
  ETHERSCAN_FETCH_DELAY: 200, // 200ms = 5 calls per second
  
  // OpenAI API settings
  OPENAI_AUDIT_DELAY: 10000, // 10 seconds between audits
  OPENAI_RATE_LIMIT_WAIT: 60000, // 60 seconds when rate limited
  
  // Background process intervals
  FETCHER_CHECK_INTERVAL: 5000, // 5 seconds
  AUDITOR_CHECK_INTERVAL: 10000, // 10 seconds
};

export function isCombinedMode() {
  return SETTINGS.PROCESSING_MODE === 'combined';
}

export function isSeparateMode() {
  return SETTINGS.PROCESSING_MODE === 'separate';
}
