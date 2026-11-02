import { describe, expect, it } from 'vitest'
import { parsePlanDraft, type PlanDraft } from './planDraft'

const draft = (patch: Partial<PlanDraft> = {}): PlanDraft => ({
  tenor: '90',
  apr: '2.25',
  penalty: '4',
  min: '500',
  max: '100000',
  ...patch,
})

describe('parsePlanDraft', () => {
  it('accepts the plan the contract accepts: a zero minimum and no cap', () => {
    const result = parsePlanDraft({ tenor: '1', apr: '96', penalty: '3', min: '0', max: '0' })

    expect(result.valid).toBe(true)
    expect(result.tenorDays).toBe(1)
    expect(result.aprBps).toBe(9600)
    expect(result.penaltyBps).toBe(300)
    expect(result.minDeposit).toBe(0)
    expect(result.maxDeposit).toBe(0)
  })

  it('converts percentages to basis points', () => {
    const result = parsePlanDraft(draft())

    expect(result.valid).toBe(true)
    expect(result.aprBps).toBe(225)
    expect(result.penaltyBps).toBe(400)
  })

  it('rejects a tenor below one day, because createPlan does', () => {
    expect(parsePlanDraft(draft({ tenor: '0' })).valid).toBe(false)
    expect(parsePlanDraft(draft({ tenor: '' })).valid).toBe(false)
  })

  it('rejects APR outside 0–100%', () => {
    expect(parsePlanDraft(draft({ apr: '0' })).valid).toBe(false)
    expect(parsePlanDraft(draft({ apr: '100' })).valid).toBe(true)
    expect(parsePlanDraft(draft({ apr: '100.5' })).valid).toBe(false)
  })

  it('rejects a penalty above 100%', () => {
    expect(parsePlanDraft(draft({ penalty: '0' })).valid).toBe(true)
    expect(parsePlanDraft(draft({ penalty: '101' })).valid).toBe(false)
  })

  it('rejects a minimum above the maximum', () => {
    expect(parsePlanDraft(draft({ min: '100', max: '50' })).valid).toBe(false)
    expect(parsePlanDraft(draft({ min: '50', max: '50' })).valid).toBe(true)
  })

  it('treats an empty form as invalid', () => {
    const result = parsePlanDraft({ tenor: '', apr: '', penalty: '', min: '', max: '' })

    expect(result.valid).toBe(false)
  })
})
