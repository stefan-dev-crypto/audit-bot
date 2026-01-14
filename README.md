# Audit Bot

A modular JavaScript bot that monitors ERC20 token approval events on Ethereum and automatically fetches contract source code as **single flattened `.sol` files** - perfect for ChatGPT analysis!

## Features

- 🔍 **Real-time monitoring** of ERC20 Approval events
- 🤖 **Contract-only filtering** - ignores regular wallets
- 📝 **Automatic source fetching** from Etherscan
- 🔒 **AI-powered auditing** - OpenAI GPT-4 security analysis
- 💾 **Smart caching** - avoids duplicate fetches and audits
- ✨ **Single-file output** - one `.sol` file per contract
- 📊 **Incremental numbering** - easy chronological tracking
- 🚨 **Vulnerability alerts** - automatic detection of critical issues
- 🔧 **Modular & extensible** - ready for multiple EVM chains

## Quick Start

```bash
npm install

# Set up your API keys in .env
ETHEREUM_RPC_URL=https://ethereum.publicnode.com
ETHERSCAN_API_KEY=your_etherscan_api_key
OPENAI_API_KEY=your_openai_api_key

# Start monitoring (with automatic AI auditing)
npm start

# Or audit existing contracts in batch
npm run audit
```

## AI Auditing

The bot now includes **automatic GPT-4 security audits** with structured JSON output:

- 🔍 Analyzes contracts for critical vulnerabilities
- 📊 Returns structured JSON for automation
- 🎯 Focuses on fund-theft exploits (ETH, tokens)
- 💾 Saves both JSON and human-readable reports
- 🚨 Alerts when critical issues found

See `AUDIT_GUIDE.md` for full details.

## Output Format

Each contract = **one flattened `.sol` file**:

```
data/sources/
├── 1_0x7a250d5630b4cf539739df2c5dacb4c659f2488d.sol
├── 2_0x1111112542421ca6dc452d289314280a0f8842a65.sol
├── 3_0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45.sol
└── ...
```

**Format**: `{index}_{contractaddress}.sol`

### File Content Structure

```solidity
// Contract Address: 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D
// Contract Name: UniswapV2Router02
// Compiler: v0.6.6+commit.6c089d02
// Optimization: Enabled (999999 runs)
// License: GPL-3.0
// Etherscan: https://etherscan.io/address/0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D#code

// File: contracts/interfaces/IUniswapV2Router01.sol
// ================================================================

pragma solidity >=0.6.2;
interface IUniswapV2Router01 {
    ...
}

// File: contracts/UniswapV2Router02.sol
// ================================================================

contract UniswapV2Router02 {
    ...
}
```

## Usage

### Analyze with ChatGPT

1. Go to `data/sources/`
2. Upload any `.sol` file to ChatGPT
3. Ask: *"Analyze this contract for security vulnerabilities"*

### Manual Review

```bash
# View a contract
cat data/sources/1_0x7a250d5630b4cf539739df2c5dacb4c659f2488d.sol

# Search across all contracts
grep -r "transferFrom" data/sources/
```

## Configuration

Create `.env` file (optional):

```env
ETHEREUM_RPC_URL=https://ethereum.publicnode.com
ETHERSCAN_API_KEY=RQKMV5PAI8SZZSITH89RYZ8CPFZMRE6PHR
CHAIN=ethereum
```

## How It Works

1. Monitors ERC20 Approval events in real-time
2. Filters for contract spenders (not wallets)
3. Fetches verified source from Etherscan
4. Flattens multi-file contracts into one `.sol` file
5. Saves with incremental numbering
6. Caches to avoid duplicate fetches

## Extending to Other Chains

Add to `src/config/chains.js`:

```javascript
bsc: {
  name: 'BSC',
  chainId: 56,
  rpcUrl: process.env.BSC_RPC_URL,
  explorerApiUrl: 'https://api.bscscan.com/api',
  explorerApiKey: process.env.BSCSCAN_API_KEY,
  startBlock: 'latest',
}
```

Then set `CHAIN=bsc` in `.env`

## License

MIT
