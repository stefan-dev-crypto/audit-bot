# audit-bot

**Ethereum ERC20 Approval Event Monitor**

A Node.js application for monitoring and tracking ERC20 token Approval events on the Ethereum blockchain using ethers.js.

## Features

- ✅ **Monitor Single Token**: Track Approval events for a specific ERC20 token
- ✅ **Monitor Multiple Tokens**: Track Approval events for multiple tokens simultaneously
- ✅ **Monitor All ERC20 Tokens**: Monitor all ERC20 Approval events on the network
- ✅ **Historical Queries**: Query past Approval events from the blockchain
- ✅ **Real-time Monitoring**: Listen to live Approval events as they occur
- ✅ **Event Listeners**: Support for event-based architecture
- ✅ **Configurable**: Easy configuration via environment variables
- ✅ **Extensible**: Designed for easy extension and customization

## Installation

### Prerequisites

- Node.js 16.0.0 or higher
- npm or yarn

### Setup

1. **Clone or navigate to the project directory**:
   ```bash
   cd audit-bot
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables** (optional):
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

## Quick Start

### Basic Usage

Start monitoring with default settings (monitors USDC as example):

```bash
npm start
```

### Monitor Specific Tokens

Set environment variables:

```bash
export ETHEREUM_RPC_URL=https://ethereum-rpc.publicnode.com
export ERC20_MONITOR_TOKENS=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48,0xdAC17F958D2ee523a2206206994597C13D831ec7

npm start
```

### Run Examples

The project includes several example scripts demonstrating different use cases:

```bash
# Example 1: Monitor single token
npm run example -- 1

# Example 4: Query historical events
npm run example -- 4

# See all examples
npm run example
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ETHEREUM_RPC_URL` | Ethereum RPC endpoint URL | `https://ethereum-rpc.publicnode.com` |
| `ERC20_MONITORING_ENABLED` | Enable/disable ERC20 monitoring | `false` |
| `ERC20_MONITOR_ALL` | Monitor all ERC20 tokens | `false` |
| `ERC20_MONITOR_TOKENS` | Comma-separated list of token addresses | - |
| `ERC20_HISTORICAL_LOOKBACK` | Number of blocks to look back for historical queries | `1000` |
| `LOG_LEVEL` | Logging level (error, warn, info, debug) | `info` |

## Usage Examples

### Monitor Single Token

```javascript
const ERC20ApprovalMonitor = require('./src/monitors/erc20ApprovalMonitor');

const monitor = new ERC20ApprovalMonitor({
  rpcUrl: 'https://ethereum-rpc.publicnode.com',
});

await monitor.initialize();

monitor.monitorToken('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', (eventData) => {
  console.log('Approval Event:', {
    owner: eventData.owner,      // Sender address
    spender: eventData.spender,  // Recipient address
    amount: eventData.amount,
    blockNumber: eventData.blockNumber,
    transactionHash: eventData.transactionHash,
  });
});
```

### Monitor Multiple Tokens

```javascript
const tokens = [
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
  '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
];

monitor.monitorTokens(tokens, (eventData) => {
  console.log('Approval Event:', eventData);
});
```

### Query Historical Events

```javascript
const latestBlock = await monitor.getCurrentBlockNumber();
const fromBlock = latestBlock - 1000;

const events = await monitor.getHistoricalApprovals(
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  fromBlock,
  latestBlock
);

events.forEach(event => {
  console.log('Historical Approval:', event);
});
```

## Event Data Structure

Each Approval event returns the following structure:

```javascript
{
  tokenAddress: string,      // ERC20 token contract address
  owner: string,             // Address that approved (sender)
  spender: string,           // Address that was approved (recipient)
  amount: string,            // Approved amount (as string)
  blockNumber: number,       // Block number
  transactionHash: string,   // Transaction hash
  logIndex: number,          // Log index in block
  timestamp: Date | null,    // Block timestamp (for historical queries)
}
```

## API Reference

### ERC20ApprovalMonitor

#### Constructor

```javascript
new ERC20ApprovalMonitor(options)
```

**Options:**
- `rpcUrl` (string): Ethereum RPC endpoint URL

#### Methods

- `async initialize()` - Initialize the monitor
- `monitorToken(tokenAddress, callback)` - Monitor single token
- `monitorTokens(tokenAddresses, callback)` - Monitor multiple tokens
- `monitorAllApprovals(callback)` - Monitor all ERC20 Approval events
- `async getHistoricalApprovals(tokenAddress, fromBlock, toBlock)` - Query historical events
- `async getHistoricalApprovalsForTokens(tokenAddresses, fromBlock, toBlock)` - Query historical events for multiple tokens
- `stopMonitoringToken(tokenAddress)` - Stop monitoring a token
- `stopAll()` - Stop all monitoring
- `on(event, callback)` - Register event listener
- `off(event, callback)` - Remove event listener
- `async getCurrentBlockNumber()` - Get current block number
- `getStats()` - Get monitoring statistics

## Common Token Addresses (Mainnet)

- **USDC**: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`
- **USDT**: `0xdAC17F958D2ee523a2206206994597C13D831ec7`
- **DAI**: `0x6B175474E89094C44Da98b954EedeAC495271d0F`
- **WETH**: `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`

## RPC Endpoints

The default RPC endpoint is `https://ethereum-rpc.publicnode.com` (free public node).

You can use any Ethereum RPC endpoint:
- Alchemy
- Infura
- QuickNode
- Your own node

## Notes

- **Sender vs Recipient**: In ERC20 Approval events:
  - `owner` = **Sender** (address that approved)
  - `spender` = **Recipient** (address that can spend)
  
- **Large Numbers**: The `amount` field is returned as a string to handle very large token amounts (JavaScript's Number type can't handle all uint256 values).

- **Performance**: Monitoring all ERC20 events can be resource-intensive. Consider using specific token monitoring when possible.

## Extending the Monitor

The monitor is designed to be extensible. You can:

1. **Add custom filters** in callback functions
2. **Integrate with databases** to store events
3. **Add notification systems** (Telegram, Discord, etc.)
4. **Create analysis pipelines** for detected approvals
5. **Extend the class** to add custom functionality

Example extension:

```javascript
class CustomMonitor extends ERC20ApprovalMonitor {
  constructor(options) {
    super(options);
    this.eventStore = [];
  }
  
  async monitorTokenWithStorage(tokenAddress) {
    this.monitorToken(tokenAddress, (eventData) => {
      this.eventStore.push(eventData);
      // Add custom logic here
    });
  }
}
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please open an issue on the repository.
