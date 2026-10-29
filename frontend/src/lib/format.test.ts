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
