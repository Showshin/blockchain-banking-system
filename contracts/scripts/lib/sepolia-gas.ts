import fs from "node:fs";
import path from "node:path";
import {
  parseEther,
  parseUnits,
  type Provider,
  type Signer,
  type TransactionReceipt,
} from "ethers";

export type GasPolicy = {
  maxBaseFeeWei: bigint;
  maxFeeWei: bigint;
  maxPriorityFeeWei: bigint;
  maxDeployCostWei: bigint;
  maxE2eCostWei: bigint;
  minBalanceReserveWei: bigint;
  gasLimitMultiplierBps: bigint;
  gasAnomalyBps: bigint;
};

export type FeeQuote = {
  baseFeeWei: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
};

export type GasErrorCode =
  | "INVALID_POLICY"
  | "BASE_FEE_CAP"
  | "FEE_CAP_TOO_LOW"
  | "BALANCE"
  | "PENDING_TX"
  | "COST_CAP"
  | "BAD_RECEIPT"
  | "GAS_ANOMALY";

export class GasPolicyError extends Error {
  constructor(
    readonly code: GasErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "GasPolicyError";
  }
}

export type JournalStep = {
  name: string;
  nonce: number;
  to: string | null;
  txHash?: string | null;
  status: "sent" | "confirmed" | "failed";
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasUsed?: string;
  effectiveGasPrice?: string;
  blockNumber?: number;
  error?: string | null;
};

export class DeploymentJournal {
  private readonly steps: JournalStep[] = [];

  constructor(
    private readonly filePath: string,
    private readonly base: Record<string, unknown>,
  ) {}

  record(step: JournalStep): void {
    const index = this.steps.findIndex((entry) => entry.name === step.name);
    if (index >= 0) this.steps[index] = { ...this.steps[index], ...step };
    else this.steps.push(step);
    this.flush();
  }

  finish(): void {
    fs.rmSync(this.filePath, { force: true });
  }

  getSteps(): JournalStep[] {
    return this.steps.map((step) => ({ ...step }));
  }

  private flush(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    const payload = `${JSON.stringify({ ...this.base, steps: this.steps }, null, 2)}\n`;
    fs.writeFileSync(tempPath, payload);
    fs.rmSync(this.filePath, { force: true });
    fs.renameSync(tempPath, this.filePath);
  }
}

function envValue(env: NodeJS.ProcessEnv, key: string, fallback: string): string {
  const raw = env[key]?.trim();
  return raw && raw.length > 0 ? raw : fallback;
}

function positive(label: string, value: bigint): bigint {
  if (value <= 0n) throw new GasPolicyError("INVALID_POLICY", `${label} must be greater than zero.`);
  return value;
}

function parseGwei(env: NodeJS.ProcessEnv, key: string, fallback: string): bigint {
  try {
    return positive(key, parseUnits(envValue(env, key, fallback), "gwei"));
  } catch (error) {
    if (error instanceof GasPolicyError) throw error;
    throw new GasPolicyError("INVALID_POLICY", `${key} is not a valid gwei value.`);
  }
}

function parseEth(env: NodeJS.ProcessEnv, key: string, fallback: string): bigint {
  try {
    return positive(key, parseEther(envValue(env, key, fallback)));
  } catch (error) {
    if (error instanceof GasPolicyError) throw error;
    throw new GasPolicyError("INVALID_POLICY", `${key} is not a valid ETH value.`);
  }
}

function parseBps(env: NodeJS.ProcessEnv, key: string, fallback: string): bigint {
  const raw = envValue(env, key, fallback);
  if (!/^\d+$/.test(raw)) throw new GasPolicyError("INVALID_POLICY", `${key} must be an integer.`);
  return positive(key, BigInt(raw));
}

export function loadGasPolicy(env: NodeJS.ProcessEnv = process.env): GasPolicy {
  const gasLimitMultiplierBps = parseBps(env, "GAS_LIMIT_MULTIPLIER_BPS", "12000");
  const gasAnomalyBps = parseBps(env, "GAS_ANOMALY_BPS", "15000");
  if (gasLimitMultiplierBps < 10_000n) {
    throw new GasPolicyError("INVALID_POLICY", "GAS_LIMIT_MULTIPLIER_BPS must be at least 10000.");
  }
  if (gasAnomalyBps <= 10_000n) {
    throw new GasPolicyError("INVALID_POLICY", "GAS_ANOMALY_BPS must be greater than 10000.");
  }

  return {
    maxBaseFeeWei: parseGwei(env, "MAX_BASE_FEE_GWEI", "1"),
    maxFeeWei: parseGwei(env, "MAX_FEE_GWEI", "2"),
    maxPriorityFeeWei: parseGwei(env, "MAX_PRIORITY_FEE_GWEI", "0.1"),
    maxDeployCostWei: parseEth(env, "MAX_DEPLOY_COST_ETH", "0.02"),
    maxE2eCostWei: parseEth(env, "MAX_E2E_COST_ETH", "0.01"),
    minBalanceReserveWei: parseEth(env, "MIN_BALANCE_RESERVE_ETH", "0.01"),
    gasLimitMultiplierBps,
    gasAnomalyBps,
  };
}

export function quoteFees(
  baseFeeWei: bigint | null | undefined,
  suggestedPriorityWei: bigint | null | undefined,
  policy: GasPolicy,
): FeeQuote {
  if (baseFeeWei === null || baseFeeWei === undefined || baseFeeWei <= 0n) {
    throw new GasPolicyError("BASE_FEE_CAP", "The latest block did not expose a usable base fee.");
  }
  if (baseFeeWei > policy.maxBaseFeeWei) {
    throw new GasPolicyError("BASE_FEE_CAP", "The base fee is above MAX_BASE_FEE_GWEI.", {
      baseFeeWei: baseFeeWei.toString(),
      maxBaseFeeWei: policy.maxBaseFeeWei.toString(),
    });
  }

  const suggested = suggestedPriorityWei ?? 0n;
  const priority = suggested < policy.maxPriorityFeeWei ? suggested : policy.maxPriorityFeeWei;
  const doubled = baseFeeWei * 2n + priority;
  const maxFeePerGas = doubled < policy.maxFeeWei ? doubled : policy.maxFeeWei;

  if (maxFeePerGas < baseFeeWei + priority) {
    throw new GasPolicyError("FEE_CAP_TOO_LOW", "MAX_FEE_GWEI cannot cover the current base and priority fee.", {
      baseFeeWei: baseFeeWei.toString(),
      priorityWei: priority.toString(),
      maxFeeWei: policy.maxFeeWei.toString(),
    });
  }

  return { baseFeeWei, maxFeePerGas, maxPriorityFeePerGas: priority };
}

export async function readFeeQuote(provider: Provider, policy: GasPolicy): Promise<FeeQuote> {
  const [block, feeData] = await Promise.all([provider.getBlock("latest"), provider.getFeeData()]);
  return quoteFees(block?.baseFeePerGas, feeData.maxPriorityFeePerGas, policy);
}

export function applyGasLimitMultiplier(estimate: bigint, policy: GasPolicy): bigint {
  const multiplied = estimate * policy.gasLimitMultiplierBps;
  return (multiplied + 9_999n) / 10_000n;
}

export function worstCaseCost(gasLimit: bigint, maxFeePerGas: bigint): bigint {
  return gasLimit * maxFeePerGas;
}

export function assertBalance(
  balance: bigint,
  worstCaseTotal: bigint,
  policy: GasPolicy,
  reserveWei: bigint = policy.minBalanceReserveWei,
): void {
  const required = worstCaseTotal + reserveWei;
  if (balance < required) {
    throw new GasPolicyError("BALANCE", "The deployer balance cannot cover the worst-case gas cost and reserve.", {
      balanceWei: balance.toString(),
      requiredWei: required.toString(),
      worstCaseTotalWei: worstCaseTotal.toString(),
      reserveWei: reserveWei.toString(),
    });
  }
}

export function assertNonce(latestNonce: number, pendingNonce: number): void {
  if (latestNonce !== pendingNonce) {
    throw new GasPolicyError("PENDING_TX", "The deployer has a pending transaction; resolve it before continuing.", {
      latestNonce,
      pendingNonce,
    });
  }
}

/**
 * Load-balanced RPC endpoints can report the pending count one ahead of the
 * latest count right after a transaction is mined. Poll until both agree so a
 * healthy sequence is not mistaken for a stuck one.
 */
export async function alignedNonces(
  provider: {
    getTransactionCount: (address: string, blockTag?: "latest" | "pending") => Promise<number>;
  },
  address: string,
  attempts = 10,
  delayMs = 1_500,
): Promise<{ latestNonce: number; pendingNonce: number }> {
  let latestNonce = 0;
  let pendingNonce = 0;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    [latestNonce, pendingNonce] = await Promise.all([
      provider.getTransactionCount(address, "latest"),
      provider.getTransactionCount(address, "pending"),
    ]);
    if (latestNonce === pendingNonce) break;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return { latestNonce, pendingNonce };
}

export function assertCumulative(spentWei: bigint, nextWorstCaseWei: bigint, capWei: bigint): void {
  if (spentWei + nextWorstCaseWei > capWei) {
    throw new GasPolicyError("COST_CAP", "The cumulative gas cost would exceed the configured cap.", {
      spentWei: spentWei.toString(),
      nextWorstCaseWei: nextWorstCaseWei.toString(),
      capWei: capWei.toString(),
    });
  }
}

export type ReceiptExpectation = {
  gasLimit: bigint;
  maxFeePerGas: bigint;
  from: string;
  to: string | null;
  estimate: bigint;
};

export function assertReceipt(
  receipt: TransactionReceipt,
  expected: ReceiptExpectation,
  policy: GasPolicy,
): { costWei: bigint; gasUsed: bigint; effectiveGasPrice: bigint } {
  if (receipt.status !== 1) {
    throw new GasPolicyError("BAD_RECEIPT", `Transaction ${receipt.hash} did not succeed.`);
  }
  if (receipt.gasUsed > expected.gasLimit) {
    throw new GasPolicyError("BAD_RECEIPT", `Transaction ${receipt.hash} used more gas than its limit.`, {
      gasUsed: receipt.gasUsed.toString(),
      gasLimit: expected.gasLimit.toString(),
    });
  }
  const effectiveGasPrice = receipt.gasPrice ?? 0n;
  if (effectiveGasPrice > expected.maxFeePerGas) {
    throw new GasPolicyError("BAD_RECEIPT", `Transaction ${receipt.hash} paid above its max fee.`, {
      effectiveGasPrice: effectiveGasPrice.toString(),
      maxFeePerGas: expected.maxFeePerGas.toString(),
    });
  }
  if (receipt.from.toLowerCase() !== expected.from.toLowerCase()) {
    throw new GasPolicyError("BAD_RECEIPT", `Transaction ${receipt.hash} came from an unexpected sender.`);
  }
  const actualTo = receipt.to?.toLowerCase() ?? null;
  const expectedTo = expected.to?.toLowerCase() ?? null;
  if (actualTo !== expectedTo) {
    throw new GasPolicyError("BAD_RECEIPT", `Transaction ${receipt.hash} targeted an unexpected address.`, {
      expectedTo,
      actualTo,
    });
  }
  if (
    expected.estimate > 0n &&
    receipt.gasUsed > (expected.estimate * policy.gasAnomalyBps) / 10_000n
  ) {
    throw new GasPolicyError("GAS_ANOMALY", `Transaction ${receipt.hash} used more gas than expected.`, {
      gasUsed: receipt.gasUsed.toString(),
      estimate: expected.estimate.toString(),
    });
  }

  return {
    costWei: receipt.gasUsed * effectiveGasPrice,
    gasUsed: receipt.gasUsed,
    effectiveGasPrice,
  };
}

export type SentTransaction = {
  hash: string;
  nonce: number;
  wait: () => Promise<TransactionReceipt | null>;
};

export type TxOverrides = {
  nonce: number;
  gasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  value?: bigint;
};

export async function sendGuardedTx(args: {
  name: string;
  provider: Provider;
  signer: Signer;
  policy: GasPolicy;
  estimate: bigint;
  gasLimit: bigint;
  to: string | null;
  value?: bigint;
  reserveWei?: bigint;
  journal?: DeploymentJournal;
  costGuard?: { spentWei: bigint; capWei: bigint };
  build: (overrides: TxOverrides) => Promise<SentTransaction>;
}): Promise<{
  receipt: TransactionReceipt;
  hash: string;
  nonce: number;
  costWei: bigint;
  gasLimit: bigint;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  quote: FeeQuote;
}> {
  const signerAddress = await args.signer.getAddress();
  const { latestNonce, pendingNonce } = await alignedNonces(args.provider, signerAddress);
  assertNonce(latestNonce, pendingNonce);

  const quote = await readFeeQuote(args.provider, args.policy);
  if (args.costGuard) {
    assertCumulative(
      args.costGuard.spentWei,
      worstCaseCost(args.gasLimit, quote.maxFeePerGas),
      args.costGuard.capWei,
    );
  }
  const value = args.value ?? 0n;
  const balance = await args.provider.getBalance(signerAddress);
  assertBalance(
    balance,
    worstCaseCost(args.gasLimit, quote.maxFeePerGas) + value,
    args.policy,
    args.reserveWei ?? args.policy.minBalanceReserveWei,
  );

  const overrides: TxOverrides = {
    nonce: latestNonce,
    gasLimit: args.gasLimit,
    maxFeePerGas: quote.maxFeePerGas,
    maxPriorityFeePerGas: quote.maxPriorityFeePerGas,
    value,
  };

  try {
    const transaction = await args.build(overrides);
    if (transaction.nonce !== latestNonce) {
      throw new GasPolicyError("BAD_RECEIPT", `Transaction ${transaction.hash} used an unexpected nonce.`, {
        expectedNonce: latestNonce,
        actualNonce: transaction.nonce,
      });
    }
    args.journal?.record({
      name: args.name,
      nonce: latestNonce,
      to: args.to,
      txHash: transaction.hash,
      status: "sent",
      gasLimit: args.gasLimit.toString(),
      maxFeePerGas: quote.maxFeePerGas.toString(),
      maxPriorityFeePerGas: quote.maxPriorityFeePerGas.toString(),
    });

    const receipt = await transaction.wait();
    if (!receipt) {
      throw new GasPolicyError("BAD_RECEIPT", `Transaction ${transaction.hash} produced no receipt.`);
    }
    const checked = assertReceipt(
      receipt,
      {
        gasLimit: args.gasLimit,
        maxFeePerGas: quote.maxFeePerGas,
        from: signerAddress,
        to: args.to,
        estimate: args.estimate,
      },
      args.policy,
    );

    args.journal?.record({
      name: args.name,
      nonce: latestNonce,
      to: args.to,
      txHash: transaction.hash,
      status: "confirmed",
      gasLimit: args.gasLimit.toString(),
      maxFeePerGas: quote.maxFeePerGas.toString(),
      maxPriorityFeePerGas: quote.maxPriorityFeePerGas.toString(),
      gasUsed: checked.gasUsed.toString(),
      effectiveGasPrice: checked.effectiveGasPrice.toString(),
      blockNumber: receipt.blockNumber,
    });

    return {
      receipt,
      hash: transaction.hash,
      nonce: latestNonce,
      costWei: checked.costWei,
      gasLimit: args.gasLimit,
      gasUsed: checked.gasUsed,
      effectiveGasPrice: checked.effectiveGasPrice,
      quote,
    };
  } catch (error) {
    args.journal?.record({
      name: args.name,
      nonce: latestNonce,
      to: args.to,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function runGuardedSequence<T>(
  steps: Array<{ name: string; run: () => Promise<T> }>,
  onFailure?: (name: string, error: unknown) => void,
): Promise<T[]> {
  const results: T[] = [];
  for (const step of steps) {
    try {
      results.push(await step.run());
    } catch (error) {
      onFailure?.(step.name, error);
      throw error;
    }
  }
  return results;
}
