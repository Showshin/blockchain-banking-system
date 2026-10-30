import { sendGuardedTx } from "./gas.ts";
import type { KeeperContext } from "./chain.ts";

/**
 * Mirrors the DepositStatus enum in contracts/contracts/SavingCore.sol.
 * Only `active` deposits can be renewed; every other value is terminal.
 */
export const DEPOSIT_STATUS = {
  none: 0n,
  active: 1n,
  withdrawn: 2n,
  manualRenewed: 3n,
  autoRenewed: 4n,
  principalWithdrawn: 5n,
} as const;

export type DepositSnapshot = {
  id: bigint;
  owner: string;
  planId: bigint;
  principal: bigint;
  maturityAt: bigint;
  status: bigint;
  interest: bigint;
  /** Earliest chain timestamp at which auto-renew becomes callable. */
  eligibleAt: bigint;
};

export type PartitionedDeposits = {
  active: DepositSnapshot[];
  eligible: DepositSnapshot[];
  pending: DepositSnapshot[];
  terminal: number;
};

export type ScanResult = {
  now: bigint;
  gracePeriod: bigint;
  paused: boolean;
  vaultBalance: bigint;
  reservedInterest: bigint;
  total: number;
  terminal: number;
  active: DepositSnapshot[];
  eligible: DepositSnapshot[];
  pending: DepositSnapshot[];
};

export type RenewalOutcome =
  | { status: "renewed"; id: bigint; newDepositId: bigint; hash: string; gasUsed: bigint; costWei: bigint }
  | { status: "skipped"; id: bigint; reason: string }
  | { status: "failed"; id: bigint; reason: string };

/**
 * Splits snapshots into what the keeper may act on right now.
 * `eligibleAt` is inclusive: `autoRenewDeposit` requires `block.timestamp >= maturityAt + gracePeriod`,
 * so a deposit is eligible at exactly `eligibleAt` and one second earlier it is not.
 */
export function partitionDeposits(snapshots: DepositSnapshot[], now: bigint): PartitionedDeposits {
  const active = snapshots.filter((entry) => entry.status === DEPOSIT_STATUS.active);
  return {
    active,
    eligible: active.filter((entry) => now >= entry.eligibleAt),
    pending: active.filter((entry) => now < entry.eligibleAt),
    terminal: snapshots.length - active.length,
  };
}

async function mapLimit<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) continue;
      results[index] = await run(item);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function scanDeposits(context: KeeperContext): Promise<ScanResult> {
  const [block, gracePeriod, paused, vaultBalance, reservedInterest, nextDepositId] = await Promise.all([
    context.provider.getBlock("latest"),
    context.core.gracePeriod() as Promise<bigint>,
    context.vault.paused() as Promise<boolean>,
    context.token.balanceOf(context.config.addresses.vault) as Promise<bigint>,
    context.vault.reservedInterest() as Promise<bigint>,
    context.core.nextDepositId() as Promise<bigint>,
  ]);
  if (!block) throw new Error("The RPC did not return a latest block.");

  const now = BigInt(block.timestamp);
  const ids: bigint[] = [];
  for (let id = 1n; id < nextDepositId; id += 1n) ids.push(id);

  const snapshots = await mapLimit(ids, 8, async (id): Promise<DepositSnapshot> => {
    const [deposit, owner, interest] = await Promise.all([
      context.core.deposits(id) as Promise<{
        planId: bigint;
        principal: bigint;
        maturityAt: bigint;
        status: bigint;
      }>,
      context.core.ownerOf(id) as Promise<string>,
      context.core.interestAtMaturity(id) as Promise<bigint>,
    ]);
    return {
      id,
      owner,
      planId: deposit.planId,
      principal: deposit.principal,
      maturityAt: deposit.maturityAt,
      status: deposit.status,
      interest,
      eligibleAt: deposit.maturityAt + gracePeriod,
    };
  });

  const partitioned = partitionDeposits(snapshots, now);
  return {
    now,
    gracePeriod,
    paused,
    vaultBalance,
    reservedInterest,
    total: snapshots.length,
    terminal: partitioned.terminal,
    active: partitioned.active,
    eligible: partitioned.eligible,
    pending: partitioned.pending,
  };
}

export function revertReason(error: unknown): string {
  const failure = error as { reason?: string; shortMessage?: string; message?: string };
  return failure.reason ?? failure.shortMessage ?? failure.message ?? "unknown revert";
}

/**
 * Simulates the renewal before spending gas. This catches every contract guard:
 * inactive status, unelapsed grace period, paused system and a vault that cannot pay interest.
 */
export async function preflight(context: KeeperContext, id: bigint): Promise<string | null> {
  try {
    await context.core.autoRenewDeposit.staticCall(id);
    return null;
  } catch (error) {
    return revertReason(error);
  }
}

export async function renewDeposit(
  context: KeeperContext,
  snapshot: DepositSnapshot,
  spentWei: bigint,
): Promise<RenewalOutcome> {
  const id = snapshot.id;
  const to = context.config.addresses.core;
  const data = context.core.interface.encodeFunctionData("autoRenewDeposit", [id]);

  let estimate: bigint;
  try {
    estimate = await context.provider.estimateGas({ from: context.address, to, data });
  } catch (error) {
    return { status: "skipped", id, reason: revertReason(error) };
  }

  const result = await sendGuardedTx({
    provider: context.provider,
    signer: context.wallet,
    config: context.config,
    to,
    data,
    estimate,
    spentWei,
  });

  let newDepositId = 0n;
  for (const entry of result.receipt.logs) {
    try {
      const parsed = context.core.interface.parseLog({ topics: [...entry.topics], data: entry.data });
      if (parsed?.name === "Renewed") {
        newDepositId = parsed.args[1] as bigint;
      }
    } catch {
      // Renewals also carry ERC-721 and vault logs; only the Renewed event matters here.
    }
  }

  return {
    status: "renewed",
    id,
    newDepositId,
    hash: result.hash,
    gasUsed: result.gasUsed,
    costWei: result.costWei,
  };
}
