import fs from "node:fs";
import path from "node:path";
import { parseEther, parseUnits } from "ethers";

export type KeeperMode = "once" | "watch";

export type Addresses = {
  core: string;
  vault: string;
  usdc: string;
};

export type KeeperConfig = {
  mode: KeeperMode;
  dryRun: boolean;
  intervalSeconds: number;
  maxRenewalsPerRun: number;
  /** How many waiting deposits to print per pass. 0 prints all of them. */
  logWaitingLimit: number;
  maxCostWei: bigint;
  minBalanceReserveWei: bigint;
  chainId: number;
  rpcUrl: string;
  privateKey: string;
  addresses: Addresses;
  maxBaseFeeWei: bigint;
  maxFeeWei: bigint;
  maxPriorityFeeWei: bigint;
  gasLimitMultiplierBps: bigint;
};

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

function envString(env: NodeJS.ProcessEnv, key: string, fallback: string): string {
  const raw = env[key]?.trim();
  return raw && raw.length > 0 ? raw : fallback;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const raw = env[key]?.trim();
  if (!raw) throw new Error(`${key} is required.`);
  return raw;
}

function envInteger(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${key} must be a positive integer.`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer.`);
  }
  return parsed;
}

/** Same as envInteger but accepts 0, which means "no limit". */
function envCount(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${key} must be a non-negative integer.`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${key} must be a non-negative integer.`);
  return parsed;
}

function envAmount(env: NodeJS.ProcessEnv, key: string, fallback: string, unit: "eth" | "gwei"): bigint {
  const raw = envString(env, key, fallback);
  let parsed: bigint;
  try {
    parsed = unit === "eth" ? parseEther(raw) : parseUnits(raw, "gwei");
  } catch {
    throw new Error(`${key} is not a valid ${unit.toUpperCase()} amount.`);
  }
  if (parsed <= 0n) throw new Error(`${key} must be greater than zero.`);
  return parsed;
}

function parseAddress(env: NodeJS.ProcessEnv, key: string): string {
  const raw = required(env, key);
  if (!ADDRESS_PATTERN.test(raw)) throw new Error(`${key} is not a valid address.`);
  return raw;
}

type Manifest = {
  chainId?: number;
  contracts?: Partial<Record<"SavingCore" | "VaultManager" | "MockUSDC", string>>;
};

/**
 * Addresses come from the environment when the keeper runs on its own.
 * Locally, reading the deployment manifest keeps the bot in sync with the repo.
 */
function resolveAddresses(env: NodeJS.ProcessEnv): Addresses {
  const explicit = ["CORE_ADDRESS", "VAULT_ADDRESS", "USDC_ADDRESS"].every(
    (key) => env[key]?.trim().length,
  );
  if (explicit) {
    return {
      core: parseAddress(env, "CORE_ADDRESS"),
      vault: parseAddress(env, "VAULT_ADDRESS"),
      usdc: parseAddress(env, "USDC_ADDRESS"),
    };
  }

  const manifestPath = path.resolve(envString(env, "MANIFEST_PATH", "../contracts/deployments/testnet.json"));
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `Set CORE_ADDRESS, VAULT_ADDRESS and USDC_ADDRESS, or provide MANIFEST_PATH (looked in ${manifestPath}).`,
    );
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;
  const contracts = manifest.contracts ?? {};
  const missing = (["SavingCore", "VaultManager", "MockUSDC"] as const).filter(
    (name) => !contracts[name],
  );
  if (missing.length > 0) {
    throw new Error(`Manifest ${manifestPath} is missing ${missing.join(", ")}.`);
  }

  return {
    core: contracts.SavingCore as string,
    vault: contracts.VaultManager as string,
    usdc: contracts.MockUSDC as string,
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): KeeperConfig {
  const mode = envString(env, "KEEPER_MODE", "watch");
  if (mode !== "once" && mode !== "watch") {
    throw new Error('KEEPER_MODE must be "once" or "watch".');
  }

  const dryRun = envString(env, "KEEPER_DRY_RUN", "0");
  if (dryRun !== "0" && dryRun !== "1") {
    throw new Error('KEEPER_DRY_RUN must be "0" or "1".');
  }

  const forceSend = envString(env, "KEEPER_FORCE_SEND", "0");
  if (forceSend !== "0" && forceSend !== "1") {
    throw new Error('KEEPER_FORCE_SEND must be "0" or "1".');
  }

  if (forceSend === "1") {
    throw new Error(
      "KEEPER_FORCE_SEND is no longer supported: the keeper only sends once maturityAt + gracePeriod has passed.",
    );
  }

  const chainIdRaw = envString(env, "CHAIN_ID", "11155111");
  if (!/^\d+$/.test(chainIdRaw)) throw new Error("CHAIN_ID must be a number.");

  return {
    mode,
    dryRun: dryRun === "1",
    intervalSeconds: envInteger(env, "KEEPER_INTERVAL_SECONDS", 300),
    maxRenewalsPerRun: envInteger(env, "KEEPER_MAX_RENEWALS_PER_RUN", 10),
    logWaitingLimit: envCount(env, "KEEPER_LOG_WAITING_LIMIT", 0),
    maxCostWei: envAmount(env, "KEEPER_MAX_COST_ETH", "0.005", "eth"),
    minBalanceReserveWei: envAmount(env, "KEEPER_MIN_BALANCE_RESERVE_ETH", "0.005", "eth"),
    chainId: Number(chainIdRaw),
    rpcUrl: required(env, "RPC_URL"),
    privateKey: required(env, "KEEPER_PRIVATE_KEY"),
    addresses: resolveAddresses(env),
    maxBaseFeeWei: envAmount(env, "MAX_BASE_FEE_GWEI", "1", "gwei"),
    maxFeeWei: envAmount(env, "MAX_FEE_GWEI", "2", "gwei"),
    maxPriorityFeeWei: envAmount(env, "MAX_PRIORITY_FEE_GWEI", "0.1", "gwei"),
    gasLimitMultiplierBps: BigInt(envInteger(env, "GAS_LIMIT_MULTIPLIER_BPS", 12_000)),
  };
}
