import { expect } from "chai";
import {
  A,
  B,
  DEFAULT_APR_BPS,
  DEFAULT_PENALTY_BPS,
  DEFAULT_TENOR_DAYS,
  GRACE_PERIOD_DAYS,
  GRACE_PERIOD_SECONDS,
} from "../config/personal";
import { DEPLOYMENT_PLANS, EXPECTED_PLAN_COUNT, NEXT_PLAN_ID } from "../config/plans";

const USDC = (whole: number) => BigInt(whole) * 1_000_000n;

describe("deployment plans", function () {
  it("locks the fixed deployment parameters", function () {
    expect(A).to.equal(1);
    expect(B).to.equal(2);
    expect(GRACE_PERIOD_DAYS).to.equal(3n);
    expect(GRACE_PERIOD_SECONDS).to.equal(259_200n);
    expect(DEFAULT_APR_BPS).to.equal(225);
    expect(DEFAULT_PENALTY_BPS).to.equal(400);
    expect(DEFAULT_TENOR_DAYS).to.equal(90);
  });

  it("deploys the documented five plans in order", function () {
    expect(DEPLOYMENT_PLANS).to.have.length(EXPECTED_PLAN_COUNT);
    expect(EXPECTED_PLAN_COUNT).to.equal(5);
    expect(NEXT_PLAN_ID).to.equal(6n);

    expect(DEPLOYMENT_PLANS[0]).to.deep.equal({
      tenorDays: 30,
      aprBps: 175,
      minDeposit: USDC(100),
      maxDeposit: USDC(25_000),
      penaltyBps: 200,
    });
    expect(DEPLOYMENT_PLANS[1]).to.deep.equal({
      tenorDays: DEFAULT_TENOR_DAYS,
      aprBps: DEFAULT_APR_BPS,
      minDeposit: USDC(500),
      maxDeposit: USDC(100_000),
      penaltyBps: DEFAULT_PENALTY_BPS,
    });
    expect(DEPLOYMENT_PLANS[2]).to.deep.equal({
      tenorDays: 180,
      aprBps: 300,
      minDeposit: USDC(1_000),
      maxDeposit: USDC(250_000),
      penaltyBps: 450,
    });
    expect(DEPLOYMENT_PLANS[3]).to.deep.equal({
      tenorDays: 365,
      aprBps: 400,
      minDeposit: USDC(2_500),
      maxDeposit: USDC(500_000),
      penaltyBps: 500,
    });
    expect(DEPLOYMENT_PLANS[4]).to.deep.equal({
      tenorDays: 1,
      aprBps: 50,
      minDeposit: USDC(10),
      maxDeposit: USDC(10_000),
      penaltyBps: 100,
    });
  });
});
