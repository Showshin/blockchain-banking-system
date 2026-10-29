import { describe, expect, it } from 'vitest'
import { networkName } from './network'

describe('networkName', () => {
  it('names the configured Sepolia network', () => {
    expect(networkName(11155111)).toBe('Sepolia Testnet')
  })

  it('names common mainnets and testnets', () => {
    expect(networkName(1)).toBe('Ethereum')
    expect(networkName(8453)).toBe('Base')
    expect(networkName(84532)).toBe('Base Sepolia')
    expect(networkName(42161)).toBe('Arbitrum One')
    expect(networkName(11155420)).toBe('OP Sepolia')
  })

  it('falls back to a readable chain label for unknown IDs', () => {
    expect(networkName(999)).toBe('Chain 999')
    expect(networkName(0)).toBe('Chain 0')
  })
})
