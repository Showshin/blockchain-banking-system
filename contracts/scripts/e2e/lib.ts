import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { network } from "hardhat";
import {
  Wallet,
  formatUnits,
  getAddress,
  parseEther,
  parseUnits,
  type Contract,
  type Signer,
  type TransactionReceipt,
} from "ethers";
import {
  TESTNET_CHAIN_ID,
  TESTNET_NETWORK,
  readManifest,
  type DeploymentManifest,
} from "../lib/manifest";
import {
  applyGasLimitMultiplier,
  loadGasPolicy,
  sendGuardedTx,
  type GasPolicy,
  type TxOverrides,
} from "../lib/sepolia-gas";

export const USDC = (whole: number) => parseUnits(String(whole), 6);
export const usdc = (baseUnits: bigint) => `${formatUnits(baseUnits, 6)} USDC`;

export const ACTIVE = 1n;
export const WITHDRAWN = 2n;
export const MANUAL_RENEWED = 3n;
export const AUTO_RENEWED = 4n;
export const PRINCIPAL_WITHDRAWN = 5n;

export const PLAN_FAST = 1n;
export const PLAN_STANDARD = 2n;
export const PLAN_SHORT = 5n;

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

export type PhaseName = "immediate" | "mature" | "auto-renew";

export type PhaseState = {
  status: "pending" | "in_progress" | "completed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  spentWei?: string;
  checks?: string[];
  txs?: Array<{ name: string; hash: string; gasUsed: string; costWei: string }>;
  note?: string;
};

export type StoredDeposit = {
  id: string;
  openTx: string;
  planId: string;
  principal: string;
  maturityAt: string;
  status: string;
  interestAtMaturity?: string;
  note?: string;
};

export type E2EState = {
  schemaVersion: 1;
  network: typeof TESTNET_NETWORK;
  chainId: number;
  core: string;
  manifestDeployedAt: string;
  startBlock: number;
  phases: Record<PhaseName, PhaseState>;
  deposits: Record<string, StoredDeposit>;
  secondAccount: { address: string | null; source: "env" | "none" };
};

export type DepositRecord = {
  planId: bigint;
  principal: bigint;
  aprBpsAtOpen: bigint;
  penaltyBpsAtOpen: bigint;
  tenorDays: bigint;
  openedAt: bigint;
  maturityAt: bigint;
  status: bigint;
  principalSeconds: bigint;
};

type HardhatEthers = Awaited<ReturnType<typeof network.create>>["ethers"];

export type E2EContext = {
  ethers: HardhatEthers;
  provider: HardhatEthers["provider"];
  core: Contract;
  vault: Contract;
  token: Contract;
  deployer: Signer;
  deployerAddress: string;
  policy: GasPolicy;
  manifest: DeploymentManifest;
};

export function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function equal(
  actual: bigint | number | string | boolean,
  expected: bigint | number | string | boolean,
  label: string,
): void {
  if (String(actual) !== String(expected)) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}.`);
  }
}

export function statePath(): string {
  return path.join(SCRIPT_DIR, "..", "..", "deployments", `${TESTNET_NETWORK}.e2e.json`);
}

export async function createContext(): Promise<E2EContext> {
  const { ethers, networkName } = await network.create();
  check(networkName === TESTNET_NETWORK, `E2E is locked to ${TESTNET_NETWORK}; running on ${networkName}.`);

  const chain = await ethers.provider.getNetwork();
  check(chain.chainId === BigInt(TESTNET_CHAIN_ID), `E2E is locked to chain ${TESTNET_CHAIN_ID}.`);

  const manifestPath = path.join(SCRIPT_DIR, "..", "..", "deployments", `${TESTNET_NETWORK}.json`);
  const manifest = readManifest(manifestPath);
  check(manifest.chainId === TESTNET_CHAIN_ID, "Manifest is not a Sepolia deployment.");

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  check(deployer, "No deployer account is configured.");
  const deployerAddress = await deployer.getAddress();
  check(
    deployerAddress.toLowerCase() === manifest.deployer.toLowerCase(),
    "Configured signer is not the manifest deployer.",
  );

  return {
    ethers,
    provider: ethers.provider,
    core: await ethers.getContractAt("SavingCore", manifest.contracts.SavingCore, deployer),
    vault: await ethers.getContractAt("VaultManager", manifest.contracts.VaultManager, deployer),
    token: await ethers.getContractAt("MockUSDC", manifest.contracts.MockUSDC, deployer),
    deployer,
    deployerAddress,
    policy: loadGasPolicy(),
    manifest,
  };
}

export function initialPhases(): Record<PhaseName, PhaseState> {
  return {
    immediate: { status: "pending" },
    mature: { status: "pending" },
    "auto-renew": { status: "pending" },
  };
}

export function loadState(context: E2EContext): E2EState {
  const file = statePath();
  if (fs.existsSync(file)) {
    const state = JSON.parse(fs.readFileSync(file, "utf8")) as E2EState;
    check(state.schemaVersion === 1, "Unsupported E2E state schema.");
    check(
      state.core.toLowerCase() === context.manifest.contracts.SavingCore.toLowerCase(),
      "E2E state belongs to a different SavingCore deployment.",
    );
    return state;
  }
  return {
    schemaVersion: 1,
    network: TESTNET_NETWORK,
    chainId: TESTNET_CHAIN_ID,
    core: context.manifest.contracts.SavingCore,
    manifestDeployedAt: context.manifest.deployedAt,
    startBlock: context.manifest.completedBlock + 1,
    phases: initialPhases(),
    deposits: {},
    secondAccount: { address: null, source: "none" },
  };
}

export function saveState(state: E2EState): void {
  const file = statePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`);
  fs.rmSync(file, { force: true });
  fs.renameSync(temp, file);
}

export async function startPhase(state: E2EState, phase: PhaseName): Promise<boolean> {
  const entry = state.phases[phase];
  if (entry.status === "completed" || entry.status === "skipped") {
    console.log(`Phase ${phase} is ${entry.status}; nothing to do.`);
    return false;
  }
  if (entry.status === "pending") {
    entry.status = "in_progress";
    entry.startedAt = new Date().toISOString();
    saveState(state);
  }
  return true;
}

export function completePhase(state: E2EState, phase: PhaseName): void {
  state.phases[phase].status = "completed";
  state.phases[phase].completedAt = new Date().toISOString();
  saveState(state);
  console.log(`Phase ${phase} completed.`);
}

export function skipPhase(state: E2EState, phase: PhaseName, reason: string): void {
  state.phases[phase].status = "skipped";
  state.phases[phase].note = reason;
  saveState(state);
  console.log(`Phase ${phase} skipped: ${reason}`);
}

export async function phaseStep<T>(
  state: E2EState,
  phase: PhaseName,
  name: string,
  run: () => Promise<T>,
): Promise<T | undefined> {
  const entry = state.phases[phase];
  entry.checks ??= [];
  if (entry.checks.includes(name)) {
    console.log(`skip ${name}`);
    return undefined;
  }
  const result = await run();
  entry.checks.push(name);
  saveState(state);
  return result;
}

export async function readDeposit(
  context: E2EContext,
  depositId: bigint,
  blockTag?: number,
): Promise<DepositRecord> {
  return (await context.core.deposits(
    depositId,
    blockTag === undefined ? {} : { blockTag },
  )) as DepositRecord;
}

export async function recordDeposit(
  state: E2EState,
  key: string,
  depositId: bigint,
  openTx: string,
  context: E2EContext,
  blockTag?: number,
): Promise<DepositRecord> {
  const deposit = await readDeposit(context, depositId, blockTag);
  state.deposits[key] = {
    id: depositId.toString(),
    openTx,
    planId: deposit.planId.toString(),
    principal: deposit.principal.toString(),
    maturityAt: deposit.maturityAt.toString(),
    status: deposit.status.toString(),
    interestAtMaturity: (
      await context.core.interestAtMaturity(
        depositId,
        blockTag === undefined ? {} : { blockTag },
      )
    ).toString(),
  };
  saveState(state);
  return deposit;
}

export function storedDeposit(state: E2EState, key: string): StoredDeposit {
  const entry = state.deposits[key];
  check(entry, `State is missing deposit ${key}; run the immediate phase first.`);
  return entry;
}

export function eventValue(
  contract: Contract,
  receipt: TransactionReceipt,
  eventName: string,
  argName: string,
): unknown {
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === eventName) return parsed.args[argName];
    } catch {
      // Transactions may include token logs alongside SavingCore logs.
    }
  }
  throw new Error(`${eventName} event is missing from ${receipt.hash}.`);
}

export function eventArg(
  contract: Contract,
  receipt: TransactionReceipt,
  eventName: string,
  argName: string,
): bigint {
  return eventValue(contract, receipt, eventName, argName) as bigint;
}

export function eventBool(
  contract: Contract,
  receipt: TransactionReceipt,
  eventName: string,
  argName: string,
): boolean {
  return eventValue(contract, receipt, eventName, argName) as boolean;
}

export async function sendGuardedCall(
  context: E2EContext,
  state: E2EState,
  phase: PhaseName,
  name: string,
  contract: Contract,
  method: string,
  args: unknown[],
  options: { signer?: Signer; value?: bigint } = {},
): Promise<TransactionReceipt> {
  const signer = options.signer ?? context.deployer;
  const signerAddress = await signer.getAddress();
  const to = String(contract.target);
  const data = contract.interface.encodeFunctionData(method, args);
  const value = options.value ?? 0n;
  const estimate = await context.provider.estimateGas({ from: signerAddress, to, data, value });
  const gasLimit = applyGasLimitMultiplier(estimate, context.policy);

  const entry = state.phases[phase];
  const spentWei = BigInt(entry.spentWei ?? "0");
  const result = await sendGuardedTx({
    name,
    provider: context.provider,
    signer,
    policy: context.policy,
    estimate,
    gasLimit,
    to,
    value,
    costGuard: { spentWei, capWei: context.policy.maxE2eCostWei },
    build: (overrides: TxOverrides) => signer.sendTransaction({ to, data, ...overrides }),
  });

  entry.spentWei = (spentWei + result.costWei).toString();
  entry.txs ??= [];
  entry.txs.push({ name, hash: result.hash, gasUsed: result.gasUsed.toString(), costWei: result.costWei.toString() });
  saveState(state);
  console.log(`tx ${name}: ${result.hash} gas ${result.gasUsed}`);
  return result.receipt;
}

export async function expectRevert(
  action: () => Promise<unknown>,
  label: string,
  reason: RegExp | null = null,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    const failure = error as { code?: string; reason?: string; shortMessage?: string; message?: string; data?: string };
    const text = `${failure.reason ?? ""} ${failure.shortMessage ?? ""} ${failure.message ?? ""} ${failure.data ?? ""}`;
    const isRevert = failure.code === "CALL_EXCEPTION" || /revert/i.test(text);
    if (!isRevert) throw error;
    if (reason && !reason.test(text)) {
      throw new Error(`${label} reverted with an unexpected reason: ${text}`);
    }
    console.log(`revert ${label}: ${failure.reason ?? "custom error"}`);
    return;
  }
  throw new Error(`${label} should have reverted.`);
}

export async function latestTimestamp(context: E2EContext): Promise<bigint> {
  const block = await context.provider.getBlock("latest");
  check(block, "The RPC did not return a latest block.");
  return BigInt(block.timestamp);
}

export async function readyAt(context: E2EContext, target: bigint, label: string): Promise<boolean> {
  const now = await latestTimestamp(context);
  if (now >= target) return true;
  console.log(
    `${label} is not ready: chain time ${new Date(Number(now) * 1000).toISOString()}, earliest ${new Date(
      Number(target) * 1000,
    ).toISOString()}. No transactions were sent.`,
  );
  return false;
}

export async function assertReserveInvariant(context: E2EContext): Promise<bigint> {
  const nextDepositId = (await context.core.nextDepositId()) as bigint;
  let expected = 0n;
  for (let id = 1n; id < nextDepositId; id += 1n) {
    const deposit = await readDeposit(context, id);
    if (deposit.status === ACTIVE) {
      expected += (await context.core.interestAtMaturity(id)) as bigint;
    } else if (deposit.status === PRINCIPAL_WITHDRAWN) {
      expected += (await context.core.pendingInterest(id)) as bigint;
    }
  }
  const reserved = (await context.vault.reservedInterest()) as bigint;
  equal(reserved, expected, "reservedInterest does not match active and pending interest");
  const balance = (await context.token.balanceOf(context.manifest.contracts.VaultManager)) as bigint;
  check(balance >= reserved, `Vault balance ${balance} is below reserved interest ${reserved}.`);
  return reserved;
}

export function loadSecondAccount(context: E2EContext): { signer: Signer; address: string } | null {
  const key =
    process.env.E2E_SECOND_PRIVATE_KEY?.trim() || process.env.TEST_ACCOUNT_PRIVATE_KEY?.trim() || "";
  if (!key) return null;

  let wallet: Wallet;
  try {
    wallet = new Wallet(key, context.provider);
  } catch {
    throw new Error("The configured E2E second-account private key is invalid.");
  }
  const expected = process.env.TEST_ACCOUNT_ADDRESS?.trim();
  if (expected && expected.length > 0) {
    const checksummed = getAddress(expected);
    check(
      checksummed.toLowerCase() === wallet.address.toLowerCase(),
      "The second-account key does not match TEST_ACCOUNT_ADDRESS.",
    );
  }
  return { signer: wallet, address: wallet.address };
}

export async function ensureSecondAccountFunded(
  context: E2EContext,
  state: E2EState,
  phase: PhaseName,
  account: { signer: Signer; address: string },
): Promise<void> {
  const balance = await context.provider.getBalance(account.address);
  const minimum = parseEther("0.004");
  if (balance >= minimum) {
    console.log(`Second account ${account.address} already funded with ${formatUnits(balance, 18)} ETH.`);
    return;
  }

  const topUp = parseEther("0.005");
  const estimate = await context.provider.estimateGas({
    from: context.deployerAddress,
    to: account.address,
    value: topUp,
  });
  const entry = state.phases[phase];
  const spentWei = BigInt(entry.spentWei ?? "0");
  const result = await sendGuardedTx({
    name: "fundSecondAccount",
    provider: context.provider,
    signer: context.deployer,
    policy: context.policy,
    estimate,
    gasLimit: applyGasLimitMultiplier(estimate, context.policy),
    to: account.address,
    value: topUp,
    costGuard: { spentWei, capWei: context.policy.maxE2eCostWei },
    build: (overrides: TxOverrides) =>
      context.deployer.sendTransaction({ to: account.address, value: topUp, ...overrides }),
  });
  entry.spentWei = (spentWei + result.costWei).toString();
  entry.txs ??= [];
  entry.txs.push({
    name: "fundSecondAccount",
    hash: result.hash,
    gasUsed: result.gasUsed.toString(),
    costWei: result.costWei.toString(),
  });
  saveState(state);
  console.log(`tx fundSecondAccount: ${result.hash} (${formatUnits(topUp, 18)} ETH)`);
}

export function finishWithError(error: unknown): void {
  console.error(error);
  process.exitCode = 1;
}
