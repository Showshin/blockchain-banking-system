import { describe, expect, it } from 'vitest'
import { formatAddress, formatBps, formatUsdc, parseAmount } from './format'

describe('formatUsdc', () => {
  it('formats with en-US grouping and two decimals', () => {
    expect(formatUsdc(0)).toBe('0.00')
    expect(formatUsdc(1_000)).toBe('1,000.00')
    expect(formatUsdc(1_234.5)).toBe('1,234.50')
    expect(formatUsdc(-5)).toBe('-5.00')
  })

  it('uses compact notation only when requested and above 10k', () => {
    expect(formatUsdc(10_000, true)).toBe('10K')
    expect(formatUsdc(9_999, true)).toBe('9,999.00')
  })

  it('keeps sub-cent interest visible instead of rounding it to zero', () => {
    expect(formatUsdc(0.000274)).toBe('0.000274')
    expect(formatUsdc(0.00822)).toBe('0.00822')
    expect(formatUsdc(0.0055)).toBe('0.0055')
    expect(formatUsdc(-0.000274)).toBe('-0.000274')
    expect(formatUsdc(0.01)).toBe('0.01')
    expect(formatUsdc(0.009999)).toBe('0.009999')
  })

  it('shows sub-cent fractions on amounts above one cent when precise is asked', () => {
    expect(formatUsdc(10.000137, false, true)).toBe('10.000137')
    expect(formatUsdc(10.000137)).toBe('10.00')
    expect(formatUsdc(1_234.5, false, true)).toBe('1,234.50')
    expect(formatUsdc(10, false, true)).toBe('10.00')
  })

  it('keeps the interest on a 1,000 USDC one-day deposit readable', () => {
    // 1,000 USDC at 0.50% APR for one day, as the contract computes it.
    expect(formatUsdc(0.013698, false, true)).toBe('0.013698')
    expect(formatUsdc(0.013698)).toBe('0.01')
  })
})

describe('formatBps', () => {
  it('formats basis points as percentages', () => {
    expect(formatBps(0)).toBe('0%')
    expect(formatBps(1)).toBe('0.01%')
    expect(formatBps(225)).toBe('2.25%')
    expect(formatBps(250)).toBe('2.50%')
    expect(formatBps(10_000)).toBe('100%')
  })
})

describe('formatAddress', () => {
  it('shortens addresses and handles null', () => {
    expect(formatAddress(null)).toBe('—')
    expect(formatAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe('0x1234…5678')
  })
})

describe('parseAmount', () => {
  it('parses dot-decimal and Vietnamese decimal-comma input', () => {
    expect(parseAmount('1000.5')).toBe(1000.5)
    expect(parseAmount('1 000,5')).toBe(1000.5)
    expect(parseAmount('1,5')).toBe(1.5)
  })

  it('accepts grouped amounts users copy from the formatted balance', () => {
    expect(parseAmount('1,000.50')).toBe(1000.5)
    expect(parseAmount('1,000')).toBe(1000)
    expect(parseAmount('1.000,50')).toBe(1000.5)
  })

  it('accepts Vietnamese thousands separators', () => {
    expect(parseAmount('1.000')).toBe(1000)
    expect(parseAmount('1.000,50')).toBe(1000.5)
    expect(parseAmount('1.000.000')).toBe(1_000_000)
  })

  it('keeps small decimal values intact', () => {
    expect(parseAmount('0.001')).toBe(0.001)
    expect(parseAmount('1.2345')).toBe(1.2345)
  })

  it('returns zero for empty or non-numeric input', () => {
    expect(parseAmount('')).toBe(0)
    expect(parseAmount('abc')).toBe(0)
    expect(parseAmount('0')).toBe(0)
  })
})
