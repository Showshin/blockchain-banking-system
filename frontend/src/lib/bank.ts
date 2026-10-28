import type { Deposit } from '../types'

export const USDC_UNITS = 1_000_000
export const DAY_MS = 86_400_000

function toUnits(value: number): bigint {
  return BigInt(Math.max(0, Math.round(value * USDC_UNITS)))
}

function fromUnits(value: bigint): number {
  return Number(value) / USDC_UNITS
}

/** Mirrors the integer arithmetic required by the assignment. */
export function interestFor(principal: number, aprBps: number, tenorDays: number): number {
  const principalUnits = toUnits(principal)
  const wholeDays = Math.max(0, Math.floor(tenorDays))
  if (principalUnits === 0n || aprBps <= 0 || wholeDays <= 0) return 0
  const interestUnits =
    (principalUnits * BigInt(aprBps) * BigInt(wholeDays)) / (365n * 10_000n)
  return fromUnits(interestUnits)
}

export function penaltyFor(principal: number, penaltyBps: number): number {
  const principalUnits = toUnits(principal)
  if (principalUnits === 0n || penaltyBps <= 0) return 0
  return fromUnits((principalUnits * BigInt(penaltyBps)) / 10_000n)
}

export function addDays(value: string | number | Date, days: number): string {
  return new Date(new Date(value).getTime() + days * DAY_MS).toISOString()
}

export function maturityFor(openedAt: string | number | Date, tenorDays: number): string {
  return addDays(openedAt, tenorDays)
}

export function isMatured(deposit: Deposit, now = Date.now()): boolean {
  return deposit.status === 'active' && new Date(deposit.maturityAt).getTime() <= now
}

export function depositProgress(deposit: Deposit, now = Date.now()): number {
  const opened = new Date(deposit.openedAt).getTime()
  const maturity = new Date(deposit.maturityAt).getTime()
  if (maturity <= opened) return 1
  return Math.min(1, Math.max(0, (now - opened) / (maturity - opened)))
}

export function interestEarned(deposit: Deposit): number {
  return interestFor(deposit.principal, deposit.aprBpsAtOpen, deposit.tenorDays)
}

export function totalOutstandingInterest(deposits: Deposit[]): number {
  return deposits
    .filter((deposit) => deposit.status === 'active')
    .reduce((total, deposit) => total + interestEarned(deposit), 0)
}

export function totalActivePrincipal(deposits: Deposit[]): number {
  return deposits
    .filter((deposit) => deposit.status === 'active')
    .reduce((total, deposit) => total + deposit.principal, 0)
}

export function roundUsdc(value: number): number {
  return Math.round(value * USDC_UNITS) / USDC_UNITS
}
