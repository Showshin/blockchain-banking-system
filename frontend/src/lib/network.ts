const NETWORK_NAMES: Record<number, string> = {
  1: 'Ethereum',
  10: 'OP Mainnet',
  137: 'Polygon',
  8453: 'Base',
  42161: 'Arbitrum One',
  80002: 'Polygon Amoy',
  84532: 'Base Sepolia',
  421614: 'Arbitrum Sepolia',
  11155111: 'Sepolia Testnet',
  11155420: 'OP Sepolia',
}

export function networkName(chainId: number): string {
  return NETWORK_NAMES[chainId] ?? `Chain ${chainId}`
}
