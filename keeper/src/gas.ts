import type { Provider, Signer, TransactionReceipt } from "ethers";
import type { KeeperConfig } from "./config.ts";

export class GasError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "GasError";
  }
}

export type FeeQuote = {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
};

export type GuardedTx = {
  hash: string;
  gasUsed: bigint;
  costWei: bigint;
  receipt: TransactionReceipt;
};

export function applyGasLimitMultiplier(estimate: bigint, bps: bigint): bigint {
  return (estimate * bps + 9_999n) / 10_000n;
}

async function quoteFees(provider: Provider, config: KeeperConfig): Promise<FeeQuote> {
  const [block, feeData] = await Promise.all([provider.getBlock("latest"), provider.getFeeData()]);
  const baseFee = block?.baseFeePerGas ?? null;
  if (baseFee === null || baseFee <= 0n) {
    throw new GasError("BASE_FEE_CAP", "The latest block did not expose a usable base fee.");
  }
  if (baseFee > config.maxBaseFeeWei) {
    throw new GasError("BASE_FEE_CAP", "The base fee is above MAX_BASE_FEE_GWEI.", {
      baseFee: baseFee.toString(),
      cap: config.maxBaseFeeWei.toString(),
    });
  }

  const suggested = feeData.maxPriorityFeePerGas ?? 0n;
  const priority = suggested < config.maxPriorityFeeWei ? suggested : config.maxPriorityFeeWei;
  const doubled = baseFee * 2n + priority;
  const maxFeePerGas = doubled < config.maxFeeWei ? doubled : config.maxFeeWei;
  if (maxFeePerGas < baseFee + priority) {
    throw new GasError("FEE_CAP_TOO_LOW", "MAX_FEE_GWEI cannot cover the base and priority fee.");
  }
  return { maxFeePerGas, maxPriorityFeePerGas: priority };
}

function assertReceipt(
  receipt: TransactionReceipt,
  expected: { from: string; to: string; gasLimit: bigint; maxFeePerGas: bigint },
): { gasUsed: bigint; costWei: bigint } {
  if (receipt.status !== 1) {
    throw new GasError("BAD_RECEIPT", `Transaction ${receipt.hash} did not succeed.`);
  }
  if (receipt.gasUsed > expected.gasLimit) {
    throw new GasError("BAD_RECEIPT", `Transaction ${receipt.hash} used more gas than its limit.`);
  }
  const effectiveGasPrice = receipt.gasPrice ?? 0n;
  if (effectiveGasPrice > expected.maxFeePerGas) {
    throw new GasError("BAD_RECEIPT", `Transaction ${receipt.hash} paid above its max fee.`);
  }
  if (receipt.from.toLowerCase() !== expected.from.toLowerCase()) {
    throw new GasError("BAD_RECEIPT", `Transaction ${receipt.hash} came from an unexpected sender.`);
  }
  if ((receipt.to ?? "").toLowerCase() !== expected.to.toLowerCase()) {
    throw new GasError("BAD_RECEIPT", `Transaction ${receipt.hash} targeted an unexpected address.`);
  }
  return { gasUsed: receipt.gasUsed, costWei: receipt.gasUsed * effectiveGasPrice };
}

/**
 * Sends one transaction under the keeper's cost policy:
 * no pending transaction, base fee within cap, balance above the reserve,
 * and a receipt that matches what was requested.
 */
export async function sendGuardedTx(args: {
  provider: Provider;
  signer: Signer;
  config: KeeperConfig;
  to: string;
  data: string;
  estimate: bigint;
  spentWei: bigint;
}): Promise<GuardedTx> {
  const { provider, signer, config } = args;
  const from = await signer.getAddress();

  const [latestNonce, pendingNonce] = await Promise.all([
    provider.getTransactionCount(from, "latest"),
    provider.getTransactionCount(from, "pending"),
  ]);
  if (latestNonce !== pendingNonce) {
    throw new GasError("PENDING_TX", "The keeper has a pending transaction; resolve it first.");
  }

  const quote = await quoteFees(provider, config);
  const gasLimit = applyGasLimitMultiplier(args.estimate, config.gasLimitMultiplierBps);
  const worstCase = gasLimit * quote.maxFeePerGas;

  if (args.spentWei + worstCase > config.maxCostWei) {
    throw new GasError("COST_CAP", "This pass would exceed KEEPER_MAX_COST_ETH.", {
      spent: args.spentWei.toString(),
      worstCase: worstCase.toString(),
      cap: config.maxCostWei.toString(),
    });
  }

  const balance = await provider.getBalance(from);
  if (balance < worstCase + config.minBalanceReserveWei) {
    throw new GasError("BALANCE", "The keeper balance cannot cover the gas cost and reserve.", {
      balance: balance.toString(),
      required: (worstCase + config.minBalanceReserveWei).toString(),
    });
  }

  const transaction = await signer.sendTransaction({
    to: args.to,
    data: args.data,
    nonce: latestNonce,
    gasLimit,
    maxFeePerGas: quote.maxFeePerGas,
    maxPriorityFeePerGas: quote.maxPriorityFeePerGas,
  });
  const receipt = await transaction.wait();
  if (!receipt) {
    throw new GasError("BAD_RECEIPT", `Transaction ${transaction.hash} produced no receipt.`);
  }

  const checked = assertReceipt(receipt, {
    from,
    to: args.to,
    gasLimit,
    maxFeePerGas: quote.maxFeePerGas,
  });

  return { hash: transaction.hash, ...checked, receipt };
}
