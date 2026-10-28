import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { network } from "hardhat";

type Deployment = {
  network: string;
  chainId: number;
  feeReceiver: string;
  contracts: {
    MockUSDC: string;
    VaultManager: string;
    SavingCore: string;
  };
  completedBlock?: number;
  transactions?: {
    MockUSDC?: string | null;
    VaultManager?: string | null;
    SavingCore?: string | null;
    grantCoreRole?: string;
    mint?: string;
    approveVault?: string;
    fundVault?: string;
    createPlans?: string[];
  };
  personalVariant: {
    gracePeriodSeconds: string;
    defaultAprBps: number;
    defaultPenaltyBps: number;
    defaultTenorDays: number;
  };
  plans: Array<{
    planId: number;
    tenorDays: number;
    aprBps: number;
    minDeposit: string;
    maxDeposit: string;
    penaltyBps: number;
  }>;
};

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function main() {
  const { ethers, networkName } = await network.create();
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const manifestPath = path.join(scriptDir, "..", "deployments", `${networkName}.json`);
  check(fs.existsSync(manifestPath), `Missing deployment manifest: ${manifestPath}`);

  const deployment = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Deployment;
  const chain = await ethers.provider.getNetwork();
  check(
    Number(chain.chainId) === deployment.chainId,
    `Manifest chain ${deployment.chainId} does not match RPC chain ${chain.chainId}.`,
  );

  const addresses = Object.values(deployment.contracts);
  for (const address of addresses) {
    const code = await ethers.provider.getCode(address);
    check(code !== "0x", `No bytecode found at ${address}.`);
  }

  const transactionHashes = deployment.transactions
    ? [
        deployment.transactions.MockUSDC,
        deployment.transactions.VaultManager,
        deployment.transactions.SavingCore,
        deployment.transactions.grantCoreRole,
        deployment.transactions.mint,
        deployment.transactions.approveVault,
        deployment.transactions.fundVault,
        ...(deployment.transactions.createPlans ?? []),
      ].filter((hash): hash is string => typeof hash === "string" && hash.length > 0)
    : [];
  check(new Set(transactionHashes).size === transactionHashes.length, "Manifest contains duplicate transactions.");
  for (const hash of transactionHashes) {
    const receipt = await ethers.provider.getTransactionReceipt(hash);
    check(receipt?.status === 1, `Transaction ${hash} has no successful receipt.`);
  }

  const token = await ethers.getContractAt("MockUSDC", deployment.contracts.MockUSDC);
  const vault = await ethers.getContractAt("VaultManager", deployment.contracts.VaultManager);
  const core = await ethers.getContractAt("SavingCore", deployment.contracts.SavingCore);

  check((await token.decimals()) === 6n, "MockUSDC must use 6 decimals.");
  check((await token.symbol()) === "USDC", "MockUSDC symbol must be USDC.");
  check(
    String(await vault.asset()).toLowerCase() === deployment.contracts.MockUSDC.toLowerCase(),
    "VaultManager asset does not match the deployed MockUSDC.",
  );
  check(
    String(await core.asset()).toLowerCase() === deployment.contracts.MockUSDC.toLowerCase(),
    "SavingCore asset does not match the deployed MockUSDC.",
  );
  check(
    String(await core.vault()).toLowerCase() === deployment.contracts.VaultManager.toLowerCase(),
    "SavingCore vault does not match the deployed VaultManager.",
  );
  check(
    (await core.gracePeriod()) === BigInt(deployment.personalVariant.gracePeriodSeconds),
    "SavingCore grace period does not match the personal variant.",
  );
  check(
    String(await vault.feeReceiver()).toLowerCase() === deployment.feeReceiver.toLowerCase(),
    "VaultManager fee receiver does not match the manifest.",
  );
  check(
    await vault.hasRole(await vault.CORE_ROLE(), deployment.contracts.SavingCore),
    "SavingCore does not have CORE_ROLE on VaultManager.",
  );

  const nextPlanId = Number(await core.nextPlanId());
  check(nextPlanId === deployment.plans.length + 1, "Unexpected number of deployment plans.");

  for (const expected of deployment.plans) {
    const actual = await core.plans(BigInt(expected.planId));
    check(actual.tenorDays === BigInt(expected.tenorDays), `Plan ${expected.planId}: tenor mismatch.`);
    check(actual.aprBps === BigInt(expected.aprBps), `Plan ${expected.planId}: APR mismatch.`);
    check(
      actual.minDeposit === BigInt(expected.minDeposit),
      `Plan ${expected.planId}: minimum mismatch.`,
    );
    check(
      actual.maxDeposit === BigInt(expected.maxDeposit),
      `Plan ${expected.planId}: maximum mismatch.`,
    );
    check(
      actual.earlyWithdrawPenaltyBps === BigInt(expected.penaltyBps),
      `Plan ${expected.planId}: penalty mismatch.`,
    );
    check(actual.enabled, `Plan ${expected.planId}: plan is disabled.`);
  }

  const vaultBalance = await token.balanceOf(deployment.contracts.VaultManager);
  check(vaultBalance > 0n, "The interest vault has no funding.");

  console.log(`Verified ${networkName} deployment on chain ${deployment.chainId}.`);
  console.log(`Contracts: ${addresses.join(", ")}`);
  console.log(`Plans: ${deployment.plans.length}; vault balance: ${ethers.formatUnits(vaultBalance, 6)} USDC`);
  console.log(`Transactions: ${transactionHashes.length} successful`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
