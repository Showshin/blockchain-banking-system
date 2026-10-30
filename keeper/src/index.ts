import { createContext, type KeeperContext } from "./chain.ts";
import { loadConfig, type KeeperConfig } from "./config.ts";
import {
  type RenewalOutcome,
  type ScanCache,
  type ScanResult,
  preflight,
  renewDeposit,
  scanDeposits,
} from "./keeper.ts";
import { eth, renderScan, renderScanPlain, usdc } from "./report.ts";

export function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

export type PassSummary = {
  renewed: number;
  skipped: number;
  failed: number;
  spentWei: bigint;
  outcomes: RenewalOutcome[];
};

function reportScan(scan: ScanResult, waitingLimit: number): void {
  if (scan.fallbackReason) {
    log(`multicall unavailable, fell back to per-deposit reads: ${scan.fallbackReason}`);
  }

  const useTable =
    process.env.KEEPER_TABLE === "1" ||
    (process.stdout.isTTY && process.env.KEEPER_TABLE !== "0");
  if (!useTable) {
    for (const entry of renderScanPlain(scan).split("\n")) log(entry);
    return;
  }

  const limit = waitingLimit;
  const trimmed =
    limit > 0 && scan.pending.length > limit
      ? {
          ...scan,
          pending: scan.pending.slice(0, limit),
        }
      : scan;

  console.log(`\n${renderScan(trimmed)}`);
  if (trimmed !== scan) {
    console.log(
      `  ${dimNote(
        `còn ${scan.pending.length - trimmed.pending.length} sổ không hiện (KEEPER_LOG_WAITING_LIMIT)`,
      )}`,
    );
  }
  console.log("");
}

function dimNote(text: string): string {
  return !process.env.NO_COLOR ? `\u001b[2m${text}\u001b[0m` : text;
}

export async function runPass(context: KeeperContext, cache: ScanCache): Promise<PassSummary> {
  const summary: PassSummary = { renewed: 0, skipped: 0, failed: 0, spentWei: 0n, outcomes: [] };

  const scan = await scanDeposits(context, cache);
  reportScan(scan, context.config.logWaitingLimit);

  if (scan.paused) {
    summary.skipped += scan.eligible.length;
    return summary;
  }

  if (scan.eligible.length === 0) {
    log("nothing to renew in this pass");
    return summary;
  }

  let sent = 0;
  for (const snapshot of scan.eligible) {
    if (sent >= context.config.maxRenewalsPerRun) {
      log(
        `stopping after ${sent} renewal(s): KEEPER_MAX_RENEWALS_PER_RUN is ${context.config.maxRenewalsPerRun}`,
      );
      break;
    }

    const blocked = await preflight(context, snapshot.id);
    if (blocked) {
      log(`skip #${snapshot.id}: ${blocked}`);
      summary.skipped += 1;
      summary.outcomes.push({ status: "skipped", id: snapshot.id, reason: blocked });
      continue;
    }

    if (context.config.dryRun) {
      log(
        `dry-run #${snapshot.id}: would renew ${usdc(snapshot.principal)} ` +
          `(interest ${usdc(snapshot.interest)}) for owner ${snapshot.owner}`,
      );
      summary.outcomes.push({ status: "skipped", id: snapshot.id, reason: "dry-run" });
      continue;
    }

    sent += 1;

    try {
      const outcome = await renewDeposit(context, snapshot, summary.spentWei);
      summary.outcomes.push(outcome);
      if (outcome.status === "renewed") {
        summary.renewed += 1;
        summary.spentWei += outcome.costWei;
        log(
          `renewed #${snapshot.id} -> #${outcome.newDepositId} ` +
            `(principal ${usdc(snapshot.principal)}, interest ${usdc(snapshot.interest)}): ${outcome.hash}`,
        );
      } else {
        summary.skipped += 1;
        log(`skip #${snapshot.id}: ${outcome.reason}`);
      }
    } catch (error) {
      summary.failed += 1;
      const reason = error instanceof Error ? error.message : String(error);
      summary.outcomes.push({ status: "failed", id: snapshot.id, reason });
      log(`fail #${snapshot.id}: ${reason}`);
    }
  }

  return summary;
}

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
}

function banner(config: KeeperConfig, address: string): void {
  log(`keeper ${address} on chain ${config.chainId}`);
  log(`SavingCore ${config.addresses.core}`);
  log(`VaultManager ${config.addresses.vault}`);
  log(
    `mode ${config.mode}${config.dryRun ? " (dry-run)" : ""}, ` +
      `interval ${config.intervalSeconds}s, max ${config.maxRenewalsPerRun} renewal(s)/pass, ` +
      `cost cap ${eth(config.maxCostWei)}`,
  );
  if (config.mode === "watch") {
    log("watch mode: press Ctrl+C to stop after the current transaction");
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const context = await createContext(config);
  banner(config, context.address);

  const cache: ScanCache = { nextDepositId: 0n };

  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
    log("SIGINT received: finishing the current transaction, then stopping");
  });

  let pass = 0;
  while (!stopping) {
    pass += 1;
    log(`--- pass ${pass} ---`);

    let summary: PassSummary;
    try {
      summary = await runPass(context, cache);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log(`pass ${pass} aborted: ${reason}`);
      if (config.mode === "once") {
        process.exitCode = 1;
        return;
      }
      summary = { renewed: 0, skipped: 0, failed: 1, spentWei: 0n, outcomes: [] };
    }

    log(
      `pass ${pass} summary: renewed ${summary.renewed}, skipped ${summary.skipped}, ` +
        `failed ${summary.failed}, spent ${eth(summary.spentWei)}`,
    );

    if (config.mode === "once") {
      if (summary.failed > 0) process.exitCode = 1;
      log(
        "once mode: exiting after this pass. " +
          "Set KEEPER_MODE=watch in .env to keep the bot running.",
      );
      return;
    }

    if (stopping) break;
    await sleep(config.intervalSeconds);
  }

  log("keeper stopped");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
