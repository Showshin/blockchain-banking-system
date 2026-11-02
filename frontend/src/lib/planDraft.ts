import { parseAmount } from './format'

export interface PlanDraft {
  tenor: string
  apr: string
  penalty: string
  min: string
  max: string
}

export interface PlanDraftResult {
  valid: boolean
  tenorDays: number
  aprBps: number
  penaltyBps: number
  minDeposit: number
  maxDeposit: number
}

/**
 * Turns the admin form into contract arguments. The rules mirror `createPlan`:
 * tenor above zero, APR and penalty at most 100%, and a maximum of zero meaning
 * "no cap". A minimum of zero is allowed, because the contract allows it — the
 * form must not reject a plan the chain would accept.
 */
export function parsePlanDraft(draft: PlanDraft): PlanDraftResult {
  const tenorDays = Number.parseInt(draft.tenor, 10)
  const apr = Number(draft.apr)
  const penalty = Number(draft.penalty)
  const minDeposit = parseAmount(draft.min)
  const maxDeposit = parseAmount(draft.max)

  const valid =
    Number.isFinite(tenorDays) &&
    tenorDays >= 1 &&
    tenorDays <= 3650 &&
    Number.isFinite(apr) &&
    apr > 0 &&
    apr <= 100 &&
    Number.isFinite(penalty) &&
    penalty >= 0 &&
    penalty <= 100 &&
    Number.isFinite(minDeposit) &&
    minDeposit >= 0 &&
    Number.isFinite(maxDeposit) &&
    (maxDeposit === 0 || maxDeposit >= minDeposit)

  return {
    valid,
    tenorDays,
    aprBps: Math.round(apr * 100),
    penaltyBps: Math.round(penalty * 100),
    minDeposit,
    maxDeposit,
  }
}
