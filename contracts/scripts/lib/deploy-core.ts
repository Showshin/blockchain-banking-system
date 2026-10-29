import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { network } from "hardhat";
import {
  MaxUint256,
  getAddress,
  parseUnits,
  type Contract,
} from "ethers";
import {
  DEFAULT_APR_BPS,
  DEFAULT_PENALTY_BPS,
  DEFAULT_TENOR_DAYS,
  GRACE_PERIOD_SECONDS,
  STUDENT_ID,
} from "../../config/personal";
import { DEPLOYMENT_PLANS, NEXT_PLAN_ID } from "../../config/plans";
import {
  DeploymentJournal,
  applyGasLimitMultiplier,
  assertBalance,
  assertCumulative,
  assertNonce,
  loadGasPolicy,
  quoteFees,
  runGuardedSequence,
  sendGuardedTx,
  worstCaseCost,
  type FeeQuote,
  type GasPolicy,
  type TxOverrides,
} from "./sepolia-gas";
import {
  MANIFEST_SCHEMA_VERSION,
  TESTNET_CHAIN_ID,
  TESTNET_NETWORK,
  type DeploymentManifest,
  type ManifestTransaction,
} from "./manifest";

const USDC = (whole: number) => parseUnits(String(whole), 6);

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

export function deploymentsDir(): string {
  return path.join(SCRIPT_DIR, "..", "..", "deployments");
}

export const SETUP_GAS_LIMITS = {
  setCoreOnce: 150_000n,
  mint: 100_000n,
  approveVault: 90_000n,
  fundVault: 100_000n,
  createPlan: 220_000n,
} as const;

type HardhatEthers = Awaited<ReturnType<typeof network.create>>["ethers"];
type HardhatProvider = HardhatEthers["provider"];
type HardhatSigner = Awaited<ReturnType<HardhatEthers["getSigners"]>>[number];

type DeployEstimate = {
  name: "MockUSDC" | "VaultManager" | "SavingCore";
  estimate: bigint;
  gasLimit: bigint;
};

export type DryRunReport = {
  kind: "dry-run";
  network: string;
  chainId: number;
  blockNumber: number;
  blockGasLimit: string;
  deployer: string;
  feeReceiver: string;
  balanceWei: string;
  quote: { baseFeeWei: string; maxFeePerGas: string; maxPriorityFeePerGas: string };
  deployEstimates: Array<{ name: string; estimate: string; gasLimit: string }>;
  setupStatic: Array<{ name: string; count: number; gasLimit: string; total: string }>;
  totalGasLimit: string;
  worstCaseWei: string;
  deployCapWei: string;
  nextPlanId: string;
  generatedAt: string;
};

type Prepared = {
  ethers: HardhatEthers;
  networkName: string;
  provider: HardhatProvider;
  deployer: HardhatSigner;
  deployerAddress: string;
  feeReceiver: string;
  policy: GasPolicy;
  chainId: number;
  blockNumber: number;
  blockGasLimit: bigint;
  balanceWei: bigint;
  quote: FeeQuote;
  deployEstimates: DeployEstimate[];
  worstCaseWei: bigint;
};

function setupStaticBudget(): Array<{ name: string; count: number; gasLimit: bigint; total: bigint }> {
  return [
    { name: "setCoreOnce", count: 1, gasLimit: SETUP_GAS_LIMITS.setCoreOnce, total: SETUP_GAS_LIMITS.setCoreOnce },
    { name: "mint", count: 1, gasLimit: SETUP_GAS_LIMITS.mint, total: SETUP_GAS_LIMITS.mint },
    { name: "approveVault", count: 1, gasLimit: SETUP_GAS_LIMITS.approveVault, total: SETUP_GAS_LIMITS.approveVault },
    { name: "fundVault", count: 1, gasLimit: SETUP_GAS_LIMITS.fundVault, total: SETUP_GAS_LIMITS.fundVault },
    {
      name: "createPlan",
      count: DEPLOYMENT_PLANS.length,
      gasLimit: SETUP_GAS_LIMITS.createPlan,
      total: SETUP_GAS_LIMITS.createPlan * BigInt(DEPLOYMENT_PLANS.length),
    },
  ];
}

function fail(message: string): never {
  throw new Error(message);
}

async function preflight(ethers: HardhatEthers, networkName: string): Promise<Prepared> {
  if (networkName !== TESTNET_NETWORK) {
    fail(`Deployment is locked to ${TESTNET_NETWORK}; running on ${networkName}.`);
  }

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  if (!deployer) fail("No deployer account is configured for this network.");
  const deployerAddress = await deployer.getAddress();

  const provider = ethers.provider;
  const chain = await provider.getNetwork();
  if (chain.chainId !== BigInt(TESTNET_CHAIN_ID)) {
    fail(`Deployment is locked to chain ${TESTNET_CHAIN_ID}; RPC reported ${chain.chainId}.`);
  }

  const configuredFeeReceiver = process.env.FEE_RECEIVER_ADDRESS?.trim();
  const feeReceiver = configuredFeeReceiver ? getAddress(configuredFeeReceiver) : deployerAddress;

  const policy = loadGasPolicy();
  const [block, feeData, latestNonce, pendingNonce, balanceWei] = await Promise.all([
    provider.getBlock("latest"),
    provider.getFeeData(),
    provider.getTransactionCount(deployerAddress, "latest"),
    provider.getTransactionCount(deployerAddress, "pending"),
    provider.getBalance(deployerAddress),
  ]);
  if (!block) fail("The RPC did not return a latest block.");
  assertNonce(latestNonce, pendingNonce);

  const quote = quoteFees(block.baseFeePerGas, feeData.maxPriorityFeePerGas, policy);

  const deployInputs: Array<{
    name: DeployEstimate["name"];
    args: unknown[];
  }> = [
    { name: "MockUSDC", args: [] },
    // Constructor address checks reject the zero address, so placeholders use the deployer.
    { name: "VaultManager", args: [deployerAddress, deployerAddress, feeReceiver] },
    { name: "SavingCore", args: [deployerAddress, deployerAddress, GRACE_PERIOD_SECONDS] },
  ];

  const deployEstimates: DeployEstimate[] = [];
  for (const input of deployInputs) {
    const factory = await ethers.getContractFactory(input.name, deployer);
    const tx = await factory.getDeployTransaction(...input.args);
    if (!tx.data) fail(`${input.name} deploy transaction has no data.`);
    const estimate = await provider.estimateGas({ from: deployerAddress, data: tx.data });
    deployEstimates.push({
      name: input.name,
      estimate,
      gasLimit: applyGasLimitMultiplier(estimate, policy),
    });
  }

  const setupGas = setupStaticBudget().reduce((total, entry) => total + entry.total, 0n);
  const deployGas = deployEstimates.reduce((total, entry) => total + entry.gasLimit, 0n);
  const worstCaseWei = worstCaseCost(deployGas + setupGas, quote.maxFeePerGas);

  for (const entry of deployEstimates) {
    if (entry.gasLimit > block.gasLimit) {
      fail(`${entry.name} gas limit ${entry.gasLimit} exceeds the block gas limit ${block.gasLimit}.`);
    }
  }

  assertBalance(balanceWei, worstCaseWei, policy);
  assertCumulative(0n, worstCaseWei, policy.maxDeployCostWei);

  return {
    ethers,
    networkName,
    provider,
    deployer,
    deployerAddress,
    feeReceiver,
    policy,
    chainId: Number(chain.chainId),
    blockNumber: block.number,
    blockGasLimit: block.gasLimit,
    balanceWei,
    quote,
    deployEstimates,
    worstCaseWei,
  };
}

function printPreflight(prepared: Prepared): void {
  const setup = setupStaticBudget();
  console.log(`Network ${prepared.networkName} chain ${prepared.chainId}, block ${prepared.blockNumber}, gas limit ${prepared.blockGasLimit}`);
  console.log(`Deployer ${prepared.deployerAddress} balance ${prepared.balanceWei} wei`);
  console.log(`Fee base ${prepared.quote.baseFeeWei} max ${prepared.quote.maxFeePerGas} priority ${prepared.quote.maxPriorityFeePerGas}`);
  for (const entry of prepared.deployEstimates) {
    console.log(`deploy ${entry.name}: estimate ${entry.estimate} gasLimit ${entry.gasLimit}`);
  }
  for (const entry of setup) {
    console.log(`setup ${entry.name} x${entry.count}: static ${entry.total}`);
  }
  console.log(`Worst-case cost ${prepared.worstCaseWei} wei (cap ${prepared.policy.maxDeployCostWei})`);
}

function toManifestTx(
  result: {
    hash: string;
    nonce: number;
    receipt: { blockNumber: number };
    gasLimit: bigint;
    gasUsed: bigint;
    effectiveGasPrice: bigint;
    quote: FeeQuote;
  },
  step: string,
  to: string | null,
): ManifestTransaction {
  return {
    step,
    hash: result.hash,
    nonce: result.nonce,
    to,
    gasLimit: result.gasLimit.toString(),
    gasUsed: result.gasUsed.toString(),
    effectiveGasPrice: result.effectiveGasPrice.toString(),
    maxFeePerGas: result.quote.maxFeePerGas.toString(),
    maxPriorityFeePerGas: result.quote.maxPriorityFeePerGas.toString(),
    blockNumber: result.receipt.blockNumber,
  };
}

export async function runDeploy(options: { dryRun: boolean }): Promise<DeploymentManifest | null> {
  const { ethers, networkName } = await network.create();
  const prepared = await preflight(ethers, networkName);
  printPreflight(prepared);

  if (options.dryRun) {
    const report: DryRunReport = {
      kind: "dry-run",
      network: prepared.networkName,
      chainId: prepared.chainId,
      blockNumber: prepared.blockNumber,
      blockGasLimit: prepared.blockGasLimit.toString(),
      deployer: prepared.deployerAddress,
      feeReceiver: prepared.feeReceiver,
      balanceWei: prepared.balanceWei.toString(),
      quote: {
        baseFeeWei: prepared.quote.baseFeeWei.toString(),
        maxFeePerGas: prepared.quote.maxFeePerGas.toString(),
        maxPriorityFeePerGas: prepared.quote.maxPriorityFeePerGas.toString(),
      },
      deployEstimates: prepared.deployEstimates.map((entry) => ({
        name: entry.name,
        estimate: entry.estimate.toString(),
        gasLimit: entry.gasLimit.toString(),
      })),
      setupStatic: setupStaticBudget().map((entry) => ({
        name: entry.name,
        count: entry.count,
        gasLimit: entry.gasLimit.toString(),
        total: entry.total.toString(),
      })),
      totalGasLimit: (
        prepared.deployEstimates.reduce((total, entry) => total + entry.gasLimit, 0n) +
        setupStaticBudget().reduce((total, entry) => total + entry.total, 0n)
      ).toString(),
      worstCaseWei: prepared.worstCaseWei.toString(),
      deployCapWei: prepared.policy.maxDeployCostWei.toString(),
      nextPlanId: NEXT_PLAN_ID.toString(),
      generatedAt: new Date().toISOString(),
    };
    const outputPath = path.join(deploymentsDir(), `${TESTNET_NETWORK}.dryrun.json`);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Dry run passed. Report written to ${outputPath}`);
    return null;
  }

  const journal = new DeploymentJournal(path.join(deploymentsDir(), `${TESTNET_NETWORK}.partial.json`), {
    schemaVersion: 1,
    network: prepared.networkName,
    chainId: prepared.chainId,
    deployer: prepared.deployerAddress,
    feeReceiver: prepared.feeReceiver,
    startNonce: await prepared.provider.getTransactionCount(prepared.deployerAddress, "latest"),
    startedAt: new Date().toISOString(),
  });

  const deployed: Record<"MockUSDC" | "VaultManager" | "SavingCore", Contract | null> = {
    MockUSDC: null,
    VaultManager: null,
    SavingCore: null,
  };
  const manifestTxs: ManifestTransaction[] = [];
  let spentWei = 0n;

  const need = (name: keyof typeof deployed): Contract => {
    const contract = deployed[name];
    if (!contract) fail(`${name} is not deployed yet.`);
    return contract;
  };

  const deployStep = async (estimate: DeployEstimate): Promise<void> => {
    const factory = await prepared.ethers.getContractFactory(estimate.name, prepared.deployer);
    const args: unknown[] =
      estimate.name === "MockUSDC"
        ? []
        : estimate.name === "VaultManager"
          ? [need("MockUSDC").target, prepared.deployerAddress, prepared.feeReceiver]
          : [need("MockUSDC").target, need("VaultManager").target, GRACE_PERIOD_SECONDS];
    const tx = await factory.getDeployTransaction(...args);
    if (!tx.data) fail(`${estimate.name} deploy transaction has no data.`);

    const result = await sendGuardedTx({
      name: estimate.name,
      provider: prepared.provider,
      signer: prepared.deployer,
      policy: prepared.policy,
      estimate: estimate.estimate,
      gasLimit: estimate.gasLimit,
      to: null,
      journal,
      costGuard: { spentWei, capWei: prepared.policy.maxDeployCostWei },
      build: (overrides: TxOverrides) =>
        prepared.deployer.sendTransaction({ data: tx.data, ...overrides }),
    });
    const address = result.receipt.contractAddress;
    if (!address) fail(`${estimate.name} deployment produced no contract address.`);
    deployed[estimate.name] = await prepared.ethers.getContractAt(estimate.name, address, prepared.deployer);

    spentWei += result.costWei;
    manifestTxs.push(toManifestTx(result, estimate.name, null));
  };

  const callStep = async (
    name: string,
    contract: Contract,
    method: string,
    args: unknown[],
    staticLimit: bigint,
  ): Promise<void> => {
    // Public RPCs inflate estimateGas far beyond real usage, so setup uses measured static limits.
    const to = String(contract.target);
    await contract.getFunction(method).staticCall(...args);
    const data = contract.interface.encodeFunctionData(method, args);

    const result = await sendGuardedTx({
      name,
      provider: prepared.provider,
      signer: prepared.deployer,
      policy: prepared.policy,
      estimate: 0n,
      gasLimit: staticLimit,
      to,
      journal,
      costGuard: { spentWei, capWei: prepared.policy.maxDeployCostWei },
      build: (overrides: TxOverrides) =>
        prepared.deployer.sendTransaction({ to, data, ...overrides }),
    });

    spentWei += result.costWei;
    manifestTxs.push(toManifestTx(result, name, to));
  };

  const steps: Array<{ name: string; run: () => Promise<void> }> = [];
  for (const estimate of prepared.deployEstimates) {
    steps.push({ name: estimate.name, run: () => deployStep(estimate) });
  }
  steps.push({
    name: "setCoreOnce",
    run: () =>
      callStep(
        "setCoreOnce",
        need("VaultManager"),
        "setCoreOnce",
        [need("SavingCore").target],
        SETUP_GAS_LIMITS.setCoreOnce,
      ),
  });
  steps.push({
    name: "mint",
    run: () =>
      callStep(
        "mint",
        need("MockUSDC"),
        "mint",
        [prepared.deployerAddress, USDC(150_000)],
        SETUP_GAS_LIMITS.mint,
      ),
  });
  steps.push({
    name: "approveVault",
    run: () =>
      callStep(
        "approveVault",
        need("MockUSDC"),
        "approve",
        [need("VaultManager").target, MaxUint256],
        SETUP_GAS_LIMITS.approveVault,
      ),
  });
  steps.push({
    name: "fundVault",
    run: () =>
      callStep(
        "fundVault",
        need("VaultManager"),
        "fundVault",
        [USDC(100_000)],
        SETUP_GAS_LIMITS.fundVault,
      ),
  });
  DEPLOYMENT_PLANS.forEach((plan, index) => {
    steps.push({
      name: `createPlan${index + 1}`,
      run: () =>
        callStep(
          `createPlan${index + 1}`,
          need("SavingCore"),
          "createPlan",
          [plan.tenorDays, plan.aprBps, plan.minDeposit, plan.maxDeposit, plan.penaltyBps],
          SETUP_GAS_LIMITS.createPlan,
        ),
    });
  });

  await runGuardedSequence(steps, (name, error) => {
    console.error(`Deployment aborted at ${name}: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`Journal retained at ${journal.getSteps().length} recorded steps; no manifest was written.`);
  });

  if (manifestTxs.length !== 3 + 1 + 3 + DEPLOYMENT_PLANS.length) {
    fail(`Expected ${3 + 4 + DEPLOYMENT_PLANS.length} transactions, recorded ${manifestTxs.length}.`);
  }

  const manifest: DeploymentManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    network: TESTNET_NETWORK,
    chainId: TESTNET_CHAIN_ID,
    deployedAt: new Date().toISOString(),
    deploymentBlock: prepared.blockNumber,
    completedBlock: manifestTxs[manifestTxs.length - 1]!.blockNumber,
    deployer: prepared.deployerAddress,
    feeReceiver: prepared.feeReceiver,
    explorerBaseUrl: process.env.EXPLORER_BASE_URL?.trim() || null,
    contracts: {
      MockUSDC: String(need("MockUSDC").target),
      VaultManager: String(need("VaultManager").target),
      SavingCore: String(need("SavingCore").target),
    },
    transactions: manifestTxs,
    gas: {
      maxBaseFeeWei: prepared.policy.maxBaseFeeWei.toString(),
      maxFeeWei: prepared.policy.maxFeeWei.toString(),
      maxPriorityFeeWei: prepared.policy.maxPriorityFeeWei.toString(),
      worstCaseWei: prepared.worstCaseWei.toString(),
      actualCostWei: spentWei.toString(),
    },
    personalVariant: {
      studentId: STUDENT_ID,
      gracePeriodSeconds: GRACE_PERIOD_SECONDS.toString(),
      defaultAprBps: DEFAULT_APR_BPS,
      defaultPenaltyBps: DEFAULT_PENALTY_BPS,
      defaultTenorDays: DEFAULT_TENOR_DAYS,
    },
    plans: DEPLOYMENT_PLANS.map((plan, index) => ({
      planId: index + 1,
      tenorDays: plan.tenorDays,
      aprBps: plan.aprBps,
      minDeposit: plan.minDeposit.toString(),
      maxDeposit: plan.maxDeposit.toString(),
      penaltyBps: plan.penaltyBps,
    })),
  };

  const outputPath = path.join(deploymentsDir(), `${TESTNET_NETWORK}.json`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  journal.finish();

  console.log(`Deployment complete: ${manifestTxs.length} transactions, actual cost ${spentWei} wei.`);
  console.log(`Contracts: ${manifest.contracts.MockUSDC}, ${manifest.contracts.VaultManager}, ${manifest.contracts.SavingCore}`);
  console.log(`Manifest written to ${outputPath}`);
  return manifest;
}
