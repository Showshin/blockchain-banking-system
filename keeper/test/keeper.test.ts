import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.ts";
import { DEPOSIT_STATUS, interestFrom, partitionDeposits, type DepositSnapshot } from "../src/keeper.ts";

const GRACE = 259_200n;
const MATURITY = 1_800_000_000n;

const BASE_ENV: NodeJS.ProcessEnv = {
  RPC_URL: "https://sepolia.invalid",
  KEEPER_PRIVATE_KEY: `0x${"11".repeat(32)}`,
  CORE_ADDRESS: `0x${"aa".repeat(20)}`,
  VAULT_ADDRESS: `0x${"bb".repeat(20)}`,
  USDC_ADDRESS: `0x${"cc".repeat(20)}`,
};

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...BASE_ENV, ...overrides };
}

function snapshot(overrides: Partial<DepositSnapshot> = {}): DepositSnapshot {
  return {
    id: 1n,
    owner: `0x${"01".repeat(20)}`,
    planId: 5n,
    principal: 20_000_000n,
    maturityAt: MATURITY,
    status: DEPOSIT_STATUS.active,
    interest: 1_370n,
    eligibleAt: MATURITY + GRACE,
    ...overrides,
  };
}

test("keeps an active deposit pending until the grace period ends", () => {
  const partitioned = partitionDeposits([snapshot()], MATURITY + GRACE - 1n);
  assert.equal(partitioned.eligible.length, 0);
  assert.equal(partitioned.pending.length, 1);
});

test("renews at exactly maturityAt + gracePeriod", () => {
  const partitioned = partitionDeposits([snapshot()], MATURITY + GRACE);
  assert.equal(partitioned.eligible.length, 1);
  assert.equal(partitioned.pending.length, 0);
});

test("renews a deposit that matured long ago", () => {
  const partitioned = partitionDeposits([snapshot()], MATURITY + GRACE + 86_400n * 30n);
  assert.equal(partitioned.eligible.length, 1);
});

test("ignores a deposit that is still before maturity", () => {
  const partitioned = partitionDeposits([snapshot()], MATURITY - 1n);
  assert.equal(partitioned.eligible.length, 0);
  assert.equal(partitioned.pending.length, 1);
});

test("never acts on a terminal deposit, even long after maturity", () => {
  const terminal = [
    DEPOSIT_STATUS.withdrawn,
    DEPOSIT_STATUS.manualRenewed,
    DEPOSIT_STATUS.autoRenewed,
    DEPOSIT_STATUS.principalWithdrawn,
  ].map((status, index) => snapshot({ id: BigInt(index + 1), status }));

  const partitioned = partitionDeposits(terminal, MATURITY + GRACE * 10n);
  assert.equal(partitioned.active.length, 0);
  assert.equal(partitioned.eligible.length, 0);
  assert.equal(partitioned.terminal, 4);
});

test("splits a mixed batch without losing any deposit", () => {
  const batch = [
    snapshot({ id: 1n, eligibleAt: MATURITY + GRACE }),
    snapshot({ id: 2n, eligibleAt: MATURITY + GRACE + 600n }),
    snapshot({ id: 3n, status: DEPOSIT_STATUS.withdrawn }),
  ];

  const partitioned = partitionDeposits(batch, MATURITY + GRACE);
  assert.equal(partitioned.active.length, 2);
  assert.deepEqual(partitioned.eligible.map((entry) => entry.id), [1n]);
  assert.deepEqual(partitioned.pending.map((entry) => entry.id), [2n]);
  assert.equal(partitioned.terminal, 1);
});

test("computes maturity interest the same way SavingCore does", () => {
  // 1,000 USDC for 90 days at 225 bps: 7,776,000s x 1e6 principal-seconds, verified on chain.
  assert.equal(interestFrom(7_776_000_000_000_000n, 225n), 5_547_945n);
  // Sub-unit results round down to zero, exactly like Math.mulDiv.
  assert.equal(interestFrom(1n, 1n), 0n);
});

test("defaults to a continuous bot with conservative limits", () => {
  const config = loadConfig(env());
  assert.equal(config.mode, "watch");
  assert.equal(config.dryRun, false);
  assert.equal(config.intervalSeconds, 300);
  assert.equal(config.maxRenewalsPerRun, 10);
  assert.equal(config.logWaitingLimit, 0);
  assert.equal(config.chainId, 11155111);
  assert.equal(config.maxCostWei, 5_000_000_000_000_000n);
});

test("prints every waiting deposit unless a limit is set", () => {
  assert.equal(loadConfig(env()).logWaitingLimit, 0);
  assert.equal(loadConfig(env({ KEEPER_LOG_WAITING_LIMIT: "3" })).logWaitingLimit, 3);
  assert.equal(loadConfig(env({ KEEPER_LOG_WAITING_LIMIT: "0" })).logWaitingLimit, 0);
});

test("rejects a non-numeric waiting limit", () => {
  assert.throws(
    () => loadConfig(env({ KEEPER_LOG_WAITING_LIMIT: "-1" })),
    /KEEPER_LOG_WAITING_LIMIT/,
  );
});

test("reads watch mode and dry-run flags from the environment", () => {
  const config = loadConfig(
    env({
      KEEPER_MODE: "watch",
      KEEPER_DRY_RUN: "1",
      KEEPER_INTERVAL_SECONDS: "60",
      KEEPER_MAX_RENEWALS_PER_RUN: "2",
    }),
  );
  assert.equal(config.mode, "watch");
  assert.equal(config.dryRun, true);
  assert.equal(config.intervalSeconds, 60);
  assert.equal(config.maxRenewalsPerRun, 2);
});

test("rejects an unknown mode", () => {
  assert.throws(() => loadConfig(env({ KEEPER_MODE: "forever" })), /KEEPER_MODE/);
});

test("rejects a malformed dry-run flag", () => {
  assert.throws(() => loadConfig(env({ KEEPER_DRY_RUN: "yes" })), /KEEPER_DRY_RUN/);
});

test("refuses to send before the grace period, even when asked", () => {
  assert.throws(() => loadConfig(env({ KEEPER_FORCE_SEND: "1" })), /KEEPER_FORCE_SEND/);
  assert.equal(loadConfig(env({ KEEPER_FORCE_SEND: "0" })).mode, "watch");
});

test("rejects a non-numeric interval", () => {
  assert.throws(() => loadConfig(env({ KEEPER_INTERVAL_SECONDS: "5m" })), /KEEPER_INTERVAL_SECONDS/);
});

test("rejects a zero renewal cap", () => {
  assert.throws(
    () => loadConfig(env({ KEEPER_MAX_RENEWALS_PER_RUN: "0" })),
    /KEEPER_MAX_RENEWALS_PER_RUN/,
  );
});

test("rejects an invalid cost cap", () => {
  assert.throws(() => loadConfig(env({ KEEPER_MAX_COST_ETH: "free" })), /KEEPER_MAX_COST_ETH/);
});

test("requires an RPC endpoint", () => {
  const { RPC_URL: _omitted, ...rest } = BASE_ENV;
  assert.throws(() => loadConfig(rest), /RPC_URL/);
});

test("requires a bot private key", () => {
  const { KEEPER_PRIVATE_KEY: _omitted, ...rest } = BASE_ENV;
  assert.throws(() => loadConfig(rest), /KEEPER_PRIVATE_KEY/);
});

test("rejects a malformed contract address", () => {
  assert.throws(() => loadConfig(env({ CORE_ADDRESS: "0x1234" })), /CORE_ADDRESS/);
});

test("asks for addresses when no manifest is reachable", () => {
  assert.throws(
    () =>
      loadConfig({
        RPC_URL: BASE_ENV.RPC_URL,
        KEEPER_PRIVATE_KEY: BASE_ENV.KEEPER_PRIVATE_KEY,
        MANIFEST_PATH: "./does-not-exist.json",
      }),
    /CORE_ADDRESS/,
  );
});
