import { Contract } from "ethers";
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

/**
 * Mirrors `_interestFor` in SavingCore.sol: `Math.mulDiv(principalSeconds, aprBpsAtOpen, 365 days * 10_000)`.
 * Computing it here removes one RPC call per deposit; the result is identical because BigInt does not overflow.
 */
const INTEREST_DENOMINATOR = 365n * 86_400n * 10_000n;

export function interestFrom(principalSeconds: bigint, aprBpsAtOpen: bigint): bigint {
  return (principalSeconds * aprBpsAtOpen) / INTEREST_DENOMINATOR;
}

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
  closed: DepositSnapshot[];
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
  /** Deposits that already ended; shown for context only. */
  closed: DepositSnapshot[];
  /** True when the pass was read through Multicall3. */
  viaMulticall: boolean;
  /** eth_call count this pass actually used. */
  callsUsed: number;
  /** Set when Multicall3 failed and the per-deposit path was used instead. */
  fallbackReason?: string;
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
    closed: snapshots.filter((entry) => entry.status !== DEPOSIT_STATUS.active),
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

/** Canonical Multicall3, deployed at the same address on Sepolia and most EVM chains. */
export const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

const MULTICALL3_ABI = [
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
  "function getCurrentBlockTimestamp() view returns (uint256)",
];

/** Sub-calls carried by one eth_call before the batch is split. */
const MAX_SUBCALLS_PER_CALL = 300;

export type ScanCache = {
  /** Last known deposit count. Each batch refreshes it so the next pass can size its range. */
  nextDepositId: bigint;
};

type DepositRow = {
  planId: bigint;
  principal: bigint;
  aprBpsAtOpen: bigint;
  maturityAt: bigint;
  status: bigint;
  principalSeconds: bigint;
};

function toSnapshot(id: bigint, row: DepositRow, gracePeriod: bigint): DepositSnapshot {
  return {
    id,
    owner: "",
    planId: row.planId,
    principal: row.principal,
    maturityAt: row.maturityAt,
    status: row.status,
    interest: interestFrom(row.principalSeconds, row.aprBpsAtOpen),
    eligibleAt: row.maturityAt + gracePeriod,
  };
}

/** The owner is only used to report a dry-run, so it is fetched for candidates only. */
async function attachOwners(context: KeeperContext, snapshots: DepositSnapshot[]): Promise<void> {
  if (snapshots.length === 0) return;
  await mapLimit(snapshots, 4, async (entry) => {
    entry.owner = (await context.core.ownerOf(entry.id)) as string;
    return entry;
  });
}

/**
 * One eth_call per batch. Multicall3 also exposes `getCurrentBlockTimestamp`, so the clock,
 * the vault state and every deposit are read in the same block — a stronger snapshot than
 * reading the block header and the deposits in separate calls.
 */
async function scanViaMulticall(context: KeeperContext, cache: ScanCache): Promise<ScanResult> {
  const { addresses } = context.config;
  const multicall = new Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, context.provider);

  if (cache.nextDepositId === 0n) {
    cache.nextDepositId = (await context.core.nextDepositId()) as bigint;
  }

  const ids: bigint[] = [];
  for (let id = 1n; id < cache.nextDepositId; id += 1n) ids.push(id);

  const chunks: bigint[][] = [];
  for (let i = 0; i < ids.length; i += MAX_SUBCALLS_PER_CALL) {
    chunks.push(ids.slice(i, i + MAX_SUBCALLS_PER_CALL));
  }
  if (chunks.length === 0) chunks.push([]);

  let now = 0n;
  let gracePeriod = 0n;
  let paused = false;
  let vaultBalance = 0n;
  let reservedInterest = 0n;
  const rows: Array<{ id: bigint; row: DepositRow }> = [];
  let callsUsed = 0;

  for (const chunk of chunks) {
    const batch = [
      {
        target: MULTICALL3_ADDRESS,
        allowFailure: false,
        callData: multicall.interface.encodeFunctionData("getCurrentBlockTimestamp"),
      },
      { target: addresses.core, allowFailure: false, callData: context.core.interface.encodeFunctionData("gracePeriod") },
      { target: addresses.core, allowFailure: true, callData: context.core.interface.encodeFunctionData("nextDepositId") },
      { target: addresses.vault, allowFailure: true, callData: context.vault.interface.encodeFunctionData("paused") },
      {
        target: addresses.usdc,
        allowFailure: true,
        callData: context.token.interface.encodeFunctionData("balanceOf", [addresses.vault]),
      },
      { target: addresses.vault, allowFailure: true, callData: context.vault.interface.encodeFunctionData("reservedInterest") },
      ...chunk.map((id) => ({
        target: addresses.core,
        allowFailure: true,
        callData: context.core.interface.encodeFunctionData("deposits", [id]),
      })),
    ];

    const results = (await multicall.aggregate3.staticCall(batch)) as Array<{
      success: boolean;
      returnData: string;
    }>;
    callsUsed += 1;

    const required = (index: number): string => {
      const entry = results[index];
      if (!entry?.success) throw new Error(`Multicall sub-call ${index} failed.`);
      return entry.returnData;
    };

    now = multicall.interface.decodeFunctionResult("getCurrentBlockTimestamp", required(0))[0] as bigint;
    gracePeriod = context.core.interface.decodeFunctionResult("gracePeriod", required(1))[0] as bigint;
    paused = context.vault.interface.decodeFunctionResult("paused", required(3))[0] as boolean;
    vaultBalance = context.token.interface.decodeFunctionResult("balanceOf", required(4))[0] as bigint;
    reservedInterest = context.vault.interface.decodeFunctionResult(
      "reservedInterest",
      required(5),
    )[0] as bigint;

    const nextEntry = results[2];
    if (nextEntry?.success) {
      cache.nextDepositId = context.core.interface.decodeFunctionResult(
        "nextDepositId",
        nextEntry.returnData,
      )[0] as bigint;
    }

    chunk.forEach((id, offset) => {
      const entry = results[6 + offset];
      if (!entry?.success) return;
      const row = context.core.interface.decodeFunctionResult(
        "deposits",
        entry.returnData,
      ) as unknown as DepositRow;
      rows.push({ id, row });
    });
  }

  const snapshots = rows.map(({ id, row }) => toSnapshot(id, row, gracePeriod));
  const partitioned = partitionDeposits(snapshots, now);
  await attachOwners(context, partitioned.eligible);

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
    closed: partitioned.closed,
    viaMulticall: true,
    callsUsed,
  };
}

/** Read path used when Multicall3 is unavailable on the configured RPC. */
async function scanPerDeposit(context: KeeperContext, cache: ScanCache): Promise<ScanResult> {
  const [block, gracePeriod, paused, vaultBalance, reservedInterest, nextDepositId] = await Promise.all([
    context.provider.getBlock("latest"),
    context.core.gracePeriod() as Promise<bigint>,
    context.vault.paused() as Promise<boolean>,
    context.token.balanceOf(context.config.addresses.vault) as Promise<bigint>,
    context.vault.reservedInterest() as Promise<bigint>,
    context.core.nextDepositId() as Promise<bigint>,
  ]);
  if (!block) throw new Error("The RPC did not return a latest block.");
  cache.nextDepositId = nextDepositId;

  const now = BigInt(block.timestamp);
  const ids: bigint[] = [];
  for (let id = 1n; id < nextDepositId; id += 1n) ids.push(id);

  const snapshots = await mapLimit(ids, 8, async (id): Promise<DepositSnapshot> => {
    const row = (await context.core.deposits(id)) as DepositRow;
    return toSnapshot(id, row, gracePeriod);
  });

  const partitioned = partitionDeposits(snapshots, now);
  await attachOwners(context, partitioned.eligible);

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
    closed: partitioned.closed,
    viaMulticall: false,
    callsUsed: 6 + ids.length,
  };
}

export async function scanDeposits(context: KeeperContext, cache: ScanCache): Promise<ScanResult> {
  try {
    return await scanViaMulticall(context, cache);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const result = await scanPerDeposit(context, cache);
    return { ...result, fallbackReason: reason };
  }
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
