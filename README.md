# audit-bot

**Ethereum ERC20 Approval Event Monitor**

A Node.js application for monitoring and tracking ERC20 token Approval events on the Ethereum blockchain using ethers.js.

## Features

### Monitoring
- ✅ **Monitor Single Token**: Track Approval events for a specific ERC20 token
- ✅ **Monitor Multiple Tokens**: Track Approval events for multiple tokens simultaneously
- ✅ **Monitor All ERC20 Tokens**: Monitor all ERC20 Approval events on the network
- ✅ **Historical Queries**: Query past Approval events from the blockchain
- ✅ **Real-time Monitoring**: Listen to live Approval events as they occur
- ✅ **Address Type Detection**: Distinguish between contract and wallet addresses

### Contract Analysis
- ✅ **Source Code Fetching**: Automatically fetch contract source code from Etherscan
- ✅ **Dual Format Storage**: Save as JSON (for tools) and readable files (for humans)
- ✅ **Smart Contract Auditing**: Integrated audit framework with Slither
- ✅ **Extensible Auditors**: Easy to add new audit tools (Mythril, Manticore, etc.)
- ✅ **Automatic Auditing**: Auto-audit contracts when detected
- ✅ **Results Storage**: Persistent storage of audit results

### General
- ✅ **Event Listeners**: Support for event-based architecture
- ✅ **Configurable**: Easy configuration via environment variables
- ✅ **Extensible**: Designed for easy extension and customization

## Installation

### Prerequisites

- Node.js 16.0.0 or higher
- npm or yarn
- Python 3.8+ (for Slither auditor, optional)
- Solidity compiler (solc, optional for auditing)

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

4. **Install Slither** (optional, for contract auditing):
   ```bash
   pip3 install slither-analyzer
   pip3 install solc-select
   solc-select install 0.8.0
   solc-select use 0.8.0
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
| **Ethereum Configuration** |
| `ETHEREUM_RPC_URL` | Ethereum RPC endpoint URL | `https://ethereum-rpc.publicnode.com` |
| **ERC20 Monitoring** |
| `ERC20_MONITORING_ENABLED` | Enable/disable ERC20 monitoring | `false` |
| `ERC20_MONITOR_ALL` | Monitor all ERC20 tokens | `false` |
| `ERC20_MONITOR_TOKENS` | JSON object of tokens: `{"USDC":"0x...","USDT":"0x..."}` | - |
| `ERC20_HISTORICAL_LOOKBACK` | Number of blocks to look back | `1000` |
| **Etherscan API** |
| `ETHERSCAN_API_KEY` | Your Etherscan API key | - |
| `ETHERSCAN_NETWORK` | Network name | `ethereum` |
| `ETHERSCAN_FETCH_SOURCE_CODE` | Auto-fetch contract source code | `false` |
| `ETHERSCAN_FETCH_ON_DETECT` | Fetch when contract detected | `false` |
| **Audit System** |
| `AUDIT_ENABLED` | Enable audit system | `false` |
| `AUDIT_ON_DETECTION` | Auto-audit on detection | `false` |
| `AUDIT_RESULTS_DIR` | Results directory | `./audit-results` |
| `SLITHER_ENABLED` | Enable Slither auditor | `true` |
| `SLITHER_PATH` | Path to slither executable | `slither` |
| `SLITHER_TIMEOUT` | Timeout in milliseconds | `120000` |
| **Logging** |
| `LOG_LEVEL` | Logging level (error, warn, info, debug) | `info` |

See `.env.example` for complete configuration.

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

## Advanced Features

### Contract Source Code Fetching

Automatically fetch and store contract source codes:

```bash
# Enable in .env
ETHERSCAN_API_KEY=your_api_key_here
ETHERSCAN_FETCH_SOURCE_CODE=true
ETHERSCAN_FETCH_ON_DETECT=true
```

Source codes are saved in two formats:
- **JSON** (`contracts/`): Complete Standard JSON Input for re-compilation
- **Readable** (`sources/`): Organized `.sol` files for analysis

See [CONTRACT_FETCHING.md](CONTRACT_FETCHING.md) for details.

### Contract Auditing

Integrated smart contract security analysis:

```bash
# Enable in .env
AUDIT_ENABLED=true
AUDIT_ON_DETECTION=true
SLITHER_ENABLED=true
```

Features:
- **Automatic auditing** when contracts are detected
- **Multiple auditors** (currently Slither, easy to add more)
- **Standardized results** in JSON format
- **Persistent storage** of audit findings

See [AUDIT_SYSTEM.md](AUDIT_SYSTEM.md) for complete documentation.

### Adding Custom Auditors

The audit framework is extensible. Example:

```javascript
const { BaseAuditor } = require('./src/auditors');

class MyCustomAuditor extends BaseAuditor {
  constructor(config) {
    super('MyAuditor', config);
  }

  async audit({ contractAddress, sourceDir, mainFile }) {
    // Your audit logic here
    const findings = await this.runMyTool(sourceDir);
    
    return this.createResult({
      success: true,
      findings: findings.map(f => ({
        id: f.id,
        title: f.title,
        severity: f.severity,
        description: f.description
      }))
    });
  }
}
```

See [AUDIT_SYSTEM.md](AUDIT_SYSTEM.md#adding-new-auditors) for step-by-step guide.

## Documentation

- **[AUDIT_SYSTEM.md](AUDIT_SYSTEM.md)** - Complete audit system documentation
- **[CONTRACT_FETCHING.md](CONTRACT_FETCHING.md)** - Contract source code fetching guide
- **[ERC20_APPROVAL_MONITOR.md](ERC20_APPROVAL_MONITOR.md)** - Detailed monitor documentation

## Examples

Run example scripts:

```bash
# ERC20 monitoring examples
npm run example

# Audit system example
node src/examples/auditExample.js
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please open an issue on the repository.
