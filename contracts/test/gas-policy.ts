import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import { parseEther, parseUnits, type TransactionReceipt } from "ethers";
import {
  DeploymentJournal,
  GasPolicyError,
  applyGasLimitMultiplier,
  assertBalance,
  assertCumulative,
  assertNonce,
  assertReceipt,
  loadGasPolicy,
  quoteFees,
  runGuardedSequence,
} from "../scripts/lib/sepolia-gas";

const GWEI = (value: string) => parseUnits(value, "gwei");
const FROM = "0x1111111111111111111111111111111111111111";
const TO = "0x2222222222222222222222222222222222222222";

function receipt(overrides: Partial<TransactionReceipt> = {}): TransactionReceipt {
  return {
    hash: `0x${"11".repeat(32)}`,
    status: 1,
    gasUsed: 100_000n,
    gasPrice: GWEI("1"),
    from: FROM,
    to: TO,
    ...overrides,
  } as unknown as TransactionReceipt;
}

function expectCode(action: () => unknown, code: string): void {
  try {
    action();
  } catch (error) {
    expect(error).to.be.instanceOf(GasPolicyError);
    expect((error as GasPolicyError).code).to.equal(code);
    return;
  }
  throw new Error(`Expected GasPolicyError ${code}.`);
}

describe("sepolia gas policy", function () {
  it("loads the documented defaults", function () {
    const policy = loadGasPolicy({});
    expect(policy.maxBaseFeeWei).to.equal(GWEI("1"));
    expect(policy.maxFeeWei).to.equal(GWEI("2"));
    expect(policy.maxPriorityFeeWei).to.equal(GWEI("0.1"));
    expect(policy.maxDeployCostWei).to.equal(parseEther("0.02"));
    expect(policy.maxE2eCostWei).to.equal(parseEther("0.01"));
    expect(policy.minBalanceReserveWei).to.equal(parseEther("0.01"));
    expect(policy.gasLimitMultiplierBps).to.equal(12_000n);
    expect(policy.gasAnomalyBps).to.equal(15_000n);
  });

  it("reads overrides and rejects unusable values", function () {
    const policy = loadGasPolicy({ MAX_FEE_GWEI: "3.5", MAX_DEPLOY_COST_ETH: "0.03" });
    expect(policy.maxFeeWei).to.equal(GWEI("3.5"));
    expect(policy.maxDeployCostWei).to.equal(parseEther("0.03"));

    expectCode(() => loadGasPolicy({ MAX_BASE_FEE_GWEI: "0" }), "INVALID_POLICY");
    expectCode(() => loadGasPolicy({ MAX_FEE_GWEI: "-1" }), "INVALID_POLICY");
    expectCode(() => loadGasPolicy({ MAX_DEPLOY_COST_ETH: "abc" }), "INVALID_POLICY");
    expectCode(() => loadGasPolicy({ GAS_LIMIT_MULTIPLIER_BPS: "9000" }), "INVALID_POLICY");
    expectCode(() => loadGasPolicy({ GAS_ANOMALY_BPS: "10000" }), "INVALID_POLICY");
  });

  it("quotes EIP-1559 fees inside the configured caps", function () {
    const policy = loadGasPolicy({});
    const quote = quoteFees(GWEI("0.5"), GWEI("0.2"), policy);
    expect(quote.maxPriorityFeePerGas).to.equal(GWEI("0.1"));
    expect(quote.maxFeePerGas).to.equal(GWEI("1.1"));

    const capped = quoteFees(GWEI("1"), GWEI("5"), policy);
    expect(capped.maxPriorityFeePerGas).to.equal(GWEI("0.1"));
    expect(capped.maxFeePerGas).to.equal(GWEI("2"));
  });

  it("aborts when the base fee is missing or above the cap", function () {
    const policy = loadGasPolicy({});
    expectCode(() => quoteFees(null, 0n, policy), "BASE_FEE_CAP");
    expectCode(() => quoteFees(GWEI("1.5"), 0n, policy), "BASE_FEE_CAP");
  });

  it("aborts when the fee cap cannot cover base plus priority", function () {
    const policy = loadGasPolicy({ MAX_BASE_FEE_GWEI: "0.2", MAX_FEE_GWEI: "0.1" });
    expectCode(() => quoteFees(GWEI("0.05"), GWEI("0.1"), policy), "FEE_CAP_TOO_LOW");
  });

  it("rounds the gas limit multiplier up", function () {
    const policy = loadGasPolicy({});
    expect(applyGasLimitMultiplier(100_000n, policy)).to.equal(120_000n);
    expect(applyGasLimitMultiplier(100_001n, policy)).to.equal(120_002n);
  });

  it("enforces balance, nonce and cumulative cost guards", function () {
    const policy = loadGasPolicy({});
    expectCode(() => assertBalance(parseEther("0.019"), parseEther("0.02"), policy), "BALANCE");
    assertBalance(parseEther("0.03"), parseEther("0.02"), policy);

    expectCode(() => assertNonce(4, 5), "PENDING_TX");
    assertNonce(4, 4);

    expectCode(() => assertCumulative(10n, 6n, 15n), "COST_CAP");
    assertCumulative(10n, 5n, 15n);
  });

  it("validates receipts against the sent transaction", function () {
    const policy = loadGasPolicy({});
    const expected = {
      gasLimit: 120_000n,
      maxFeePerGas: GWEI("2"),
      from: FROM,
      to: TO,
      estimate: 100_000n,
    };

    const checked = assertReceipt(receipt(), expected, policy);
    expect(checked.gasUsed).to.equal(100_000n);
    expect(checked.costWei).to.equal(100_000n * GWEI("1"));

    expectCode(() => assertReceipt(receipt({ status: 0 }), expected, policy), "BAD_RECEIPT");
    expectCode(() => assertReceipt(receipt({ gasUsed: 130_000n }), expected, policy), "BAD_RECEIPT");
    expectCode(() => assertReceipt(receipt({ gasPrice: GWEI("2.5") }), expected, policy), "BAD_RECEIPT");
    expectCode(
      () => assertReceipt(receipt({ from: TO }), expected, policy),
      "BAD_RECEIPT",
    );
    expectCode(() => assertReceipt(receipt({ to: FROM }), expected, policy), "BAD_RECEIPT");
    expectCode(
      () =>
        assertReceipt(
          receipt({ gasUsed: 160_000n }),
          { ...expected, gasLimit: 200_000n },
          policy,
        ),
      "GAS_ANOMALY",
    );
  });

  it("stops a guarded sequence at the first failure", async function () {
    const visited: string[] = [];
    const steps = [
      { name: "a", run: async () => void visited.push("a") },
      {
        name: "b",
        run: async () => {
          visited.push("b");
          throw new Error("boom");
        },
      },
      { name: "c", run: async () => void visited.push("c") },
    ];

    let failure: string | null = null;
    try {
      await runGuardedSequence(steps, (name) => {
        failure = name;
      });
    } catch {
      // The sequence is expected to rethrow the first failure.
    }

    expect(visited).to.deep.equal(["a", "b"]);
    expect(failure).to.equal("b");
  });

  it("writes and removes the partial journal", function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tich-journal-"));
    const file = path.join(dir, "testnet.partial.json");
    const journal = new DeploymentJournal(file, { schemaVersion: 1 });
    journal.record({ name: "MockUSDC", nonce: 0, to: null, status: "sent" });
    expect(fs.existsSync(file)).to.equal(true);
    expect(JSON.parse(fs.readFileSync(file, "utf8")).steps).to.have.length(1);

    journal.finish();
    expect(fs.existsSync(file)).to.equal(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
