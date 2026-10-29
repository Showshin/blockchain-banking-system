import { describe, expect, it } from 'vitest'
import type { Deposit } from '../types'
import {
  DAY_MS,
  depositProgress,
  interestFor,
  isClaimable,
  isMatured,
  maturityFor,
  penaltyFor,
  remainingSeconds,
  roundUsdc,
  topUpInterestFor,
  totalActivePrincipal,
  totalOutstandingInterest,
} from './bank'

const OPENED_AT = '2026-01-01T00:00:00.000Z'
const MATURITY_AT = '2026-04-01T00:00:00.000Z'

function deposit(overrides: Partial<Deposit> = {}): Deposit {
  return {
    id: '1',
    certificateNo: 1,
    planId: '1',
    principal: 1_000,
    aprBpsAtOpen: 225,
    penaltyBpsAtOpen: 400,
    tenorDays: 90,
    openedAt: OPENED_AT,
    maturityAt: MATURITY_AT,
    status: 'active',
    owner: '0x0000000000000000000000000000000000000001',
    interestAtMaturity: 5.547945,
    pendingInterest: 0,
    ...overrides,
  }
}

describe('interest and penalty math', () => {
  it('matches the contract simple-interest formula', () => {
    expect(interestFor(1_000, 225, 90)).toBeCloseTo(5.547945, 6)
    expect(interestFor(1_000, 0, 90)).toBe(0)
    expect(interestFor(1_000, 225, 0)).toBe(0)
    expect(interestFor(0, 225, 90)).toBe(0)
  })

  it('rounds penalty down on the withdrawn principal', () => {
    expect(penaltyFor(1_000, 400)).toBe(40)
    expect(penaltyFor(1_000, 0)).toBe(0)
    expect(penaltyFor(1_000, 10_000)).toBe(1_000)
  })

  it('computes maturity from the opening timestamp', () => {
    expect(new Date(maturityFor(OPENED_AT, 90)).getTime() - new Date(OPENED_AT).getTime()).toBe(
      90 * DAY_MS,
    )
  })

  it('computes top-up interest only for the remaining seconds', () => {
    const value = deposit()
    const now = new Date(MATURITY_AT).getTime() - 30 * DAY_MS
    expect(remainingSeconds(value, now)).toBe(30 * 86_400)
    expect(topUpInterestFor(value, 500, now)).toBe(0.924657)
    expect(topUpInterestFor(value, 500, new Date(MATURITY_AT).getTime())).toBe(0)
  })
})

describe('deposit state', () => {
  it('treats the exact maturity timestamp as matured', () => {
    const value = deposit()
    expect(isMatured(value, new Date(MATURITY_AT).getTime())).toBe(true)
    expect(isMatured(value, new Date(MATURITY_AT).getTime() - 1)).toBe(false)
    expect(isMatured(deposit({ status: 'withdrawn' }), new Date(MATURITY_AT).getTime())).toBe(false)
  })

  it('clamps progress to the 0..1 range', () => {
    const value = deposit()
    const opened = new Date(OPENED_AT).getTime()
    const maturity = new Date(MATURITY_AT).getTime()
    expect(depositProgress(value, opened)).toBe(0)
    expect(depositProgress(value, opened + (maturity - opened) / 2)).toBe(0.5)
    expect(depositProgress(value, maturity)).toBe(1)
    expect(depositProgress(value, maturity + DAY_MS)).toBe(1)
    expect(depositProgress(deposit({ maturityAt: OPENED_AT }), opened)).toBe(1)
  })

  it('identifies claimable deferred interest', () => {
    expect(isClaimable(deposit({ status: 'principal-withdrawn', pendingInterest: 2 }))).toBe(true)
    expect(isClaimable(deposit({ status: 'principal-withdrawn', pendingInterest: 0 }))).toBe(false)
    expect(isClaimable(deposit({ status: 'active', pendingInterest: 2 }))).toBe(false)
  })

  it('sums only active principal and outstanding interest', () => {
    const values = [
      deposit({ principal: 1_000, interestAtMaturity: 5.5 }),
      deposit({ principal: 500, status: 'principal-withdrawn', pendingInterest: 2 }),
      deposit({ principal: 300, status: 'withdrawn' }),
    ]
    expect(totalActivePrincipal(values)).toBe(1_000)
    expect(totalOutstandingInterest(values)).toBe(7.5)
  })

  it('rounds USDC values to six decimals', () => {
    expect(roundUsdc(0.1 + 0.2)).toBe(0.3)
    expect(roundUsdc(1.2345678)).toBe(1.234568)
  })
})
