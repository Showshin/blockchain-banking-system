import { DEFAULT_APR_BPS, DEFAULT_PENALTY_BPS, DEFAULT_TENOR_DAYS } from "./personal";

const USDC = (whole: number) => BigInt(whole) * 1_000_000n;

export type DeploymentPlan = {
  tenorDays: number;
  aprBps: number;
  minDeposit: bigint;
  maxDeposit: bigint;
  penaltyBps: number;
};

export const DEPLOYMENT_PLANS: DeploymentPlan[] = [
  { tenorDays: 30, aprBps: 175, minDeposit: USDC(100), maxDeposit: USDC(25_000), penaltyBps: 200 },
  {
    tenorDays: DEFAULT_TENOR_DAYS,
    aprBps: DEFAULT_APR_BPS,
    minDeposit: USDC(500),
    maxDeposit: USDC(100_000),
    penaltyBps: DEFAULT_PENALTY_BPS,
  },
  { tenorDays: 180, aprBps: 300, minDeposit: USDC(1_000), maxDeposit: USDC(250_000), penaltyBps: 450 },
  { tenorDays: 365, aprBps: 400, minDeposit: USDC(2_500), maxDeposit: USDC(500_000), penaltyBps: 500 },
  { tenorDays: 1, aprBps: 500, minDeposit: USDC(10), maxDeposit: USDC(10_000), penaltyBps: 100 },
];

export const EXPECTED_PLAN_COUNT = DEPLOYMENT_PLANS.length;
export const NEXT_PLAN_ID = BigInt(DEPLOYMENT_PLANS.length + 1);
