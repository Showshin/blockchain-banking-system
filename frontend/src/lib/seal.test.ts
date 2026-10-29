import { describe, expect, it } from 'vitest'
import { sealTierFor } from './seal'

describe('sealTierFor', () => {
  it('maps the five configured tenors to their tiers', () => {
    expect(sealTierFor(1)).toBe('bronze')
    expect(sealTierFor(30)).toBe('silver')
    expect(sealTierFor(90)).toBe('gold')
    expect(sealTierFor(180)).toBe('diamond')
    expect(sealTierFor(365)).toBe('emerald')
  })

  it('keeps the boundaries monotonic', () => {
    expect(sealTierFor(0)).toBe('bronze')
    expect(sealTierFor(2)).toBe('silver')
    expect(sealTierFor(31)).toBe('gold')
    expect(sealTierFor(91)).toBe('diamond')
    expect(sealTierFor(181)).toBe('emerald')
    expect(sealTierFor(10_000)).toBe('emerald')
  })
})
