/**
 * ERC20 token standard configuration
 * Contains ABI and event signatures
 */

export const ERC20_ABI = [
  // Approval event
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
  // Common ERC20 functions
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
];

/**
 * ERC20 Approval event topic
 * keccak256("Approval(address,address,uint256)")
 */
export const APPROVAL_EVENT_TOPIC = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';
