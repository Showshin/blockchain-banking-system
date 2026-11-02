import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { network } from "hardhat";
import {
  GRACE_PERIOD_SECONDS,
  DEFAULT_APR_BPS,
  DEFAULT_PENALTY_BPS,
  DEFAULT_TENOR_DAYS,
  STUDENT_ID,
} from "../config/personal";
import { DEPLOYMENT_PLANS, NEXT_PLAN_ID } from "../config/plans";
import {
  EXPECTED_TRANSACTION_COUNT,
  MANIFEST_SCHEMA_VERSION,
  TESTNET_CHAIN_ID,
  TESTNET_NETWORK,
  readManifest,
} from "./lib/manifest";
import { loadGasPolicy } from "./lib/sepolia-gas";

const USDC = (whole: number) => BigInt(whole) * 1_000_000n;

const EXPECTED_STEPS = [
  "MockUSDC",
  "VaultManager",
  "SavingCore",
  "setCoreOnce",
  "mint",
  "approveVault",
  "fundVault",
  ...DEPLOYMENT_PLANS.map((_, index) => `createPlan${index + 1}`),
];

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

async function main() {
  const allowPostE2e =
    process.argv.includes("--allow-post-e2e") || process.env.ALLOW_POST_E2E === "1";

  const { ethers, networkName } = await network.create();
  check(networkName === TESTNET_NETWORK, `Verification is locked to ${TESTNET_NETWORK}; running on ${networkName}.`);

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const manifestPath = path.join(scriptDir, "..", "deployments", `${TESTNET_NETWORK}.json`);
  check(fs.existsSync(manifestPath), `Missing deployment manifest: ${manifestPath}`);
  const deployment = readManifest(manifestPath);

  check(deployment.schemaVersion === MANIFEST_SCHEMA_VERSION, "Unexpected manifest schema.");
  check(deployment.network === TESTNET_NETWORK, "Manifest network is not testnet.");
  check(deployment.chainId === TESTNET_CHAIN_ID, "Manifest chain id is not Sepolia.");

  const chain = await ethers.provider.getNetwork();
  check(Number(chain.chainId) === TESTNET_CHAIN_ID, `RPC chain ${chain.chainId} is not Sepolia.`);

  const policy = loadGasPolicy();
  const addresses = Object.values(deployment.contracts);
  check(addresses.length === 3, "Manifest must contain exactly three contracts.");
  for (const address of addresses) {
    const code = await ethers.provider.getCode(address);
    check(code !== "0x", `No bytecode found at ${address}.`);
  }

  const { transactions } = deployment;
  check(
    transactions.length === EXPECTED_TRANSACTION_COUNT,
    `Manifest must contain ${EXPECTED_TRANSACTION_COUNT} transactions, found ${transactions.length}.`,
  );
  check(
    new Set(transactions.map((tx) => tx.hash)).size === transactions.length,
    "Manifest contains duplicate transactions.",
  );
  check(
    transactions.map((tx) => tx.step).join(",") === EXPECTED_STEPS.join(","),
    "Manifest transaction steps are not in the expected order.",
  );

  let totalCostWei = 0n;
  for (const [index, entry] of transactions.entries()) {
    const receipt = await ethers.provider.getTransactionReceipt(entry.hash);
    check(receipt !== null, `Transaction ${entry.hash} has no receipt.`);
    check(receipt.status === 1, `Transaction ${entry.hash} did not succeed.`);
    check(sameAddress(receipt.from, deployment.deployer), `Transaction ${entry.hash} came from another sender.`);
    check(entry.nonce === transactions[0]!.nonce + index, `Transaction ${entry.hash} breaks nonce continuity.`);
    const receiptTo = receipt.to ?? null;
    check(
      (receiptTo === null && entry.to === null) ||
        (receiptTo !== null && entry.to !== null && sameAddress(receiptTo, entry.to)),
      `Transaction ${entry.hash} targeted an unexpected address.`,
    );
    check(
      receipt.blockNumber >= deployment.deploymentBlock &&
        receipt.blockNumber <= deployment.completedBlock,
      `Transaction ${entry.hash} is outside the recorded block range.`,
    );
    check(receipt.blockNumber === entry.blockNumber, `Transaction ${entry.hash} block number drifted.`);
    check(receipt.gasUsed === BigInt(entry.gasUsed), `Transaction ${entry.hash} gasUsed drifted.`);
    check(receipt.gasPrice === BigInt(entry.effectiveGasPrice), `Transaction ${entry.hash} gas price drifted.`);
    check(BigInt(entry.maxFeePerGas) <= policy.maxFeeWei, `Transaction ${entry.hash} exceeded MAX_FEE_GWEI.`);
    check(
      BigInt(entry.effectiveGasPrice) <= BigInt(entry.maxFeePerGas),
      `Transaction ${entry.hash} paid above its max fee.`,
    );
    check(BigInt(entry.gasUsed) <= BigInt(entry.gasLimit), `Transaction ${entry.hash} exceeded its gas limit.`);

    if (index < 3) {
      check(
        receipt.contractAddress !== null &&
          sameAddress(receipt.contractAddress, Object.values(deployment.contracts)[index]!),
        `Deployment ${entry.step} produced an unexpected address.`,
      );
    }

    totalCostWei += BigInt(entry.gasUsed) * BigInt(entry.effectiveGasPrice);
  }
  check(totalCostWei === BigInt(deployment.gas.actualCostWei), "Manifest actual cost does not match its transactions.");
  check(totalCostWei <= policy.maxDeployCostWei, "Deployment cost exceeded MAX_DEPLOY_COST_ETH.");
  check(BigInt(deployment.gas.maxFeeWei) <= policy.maxFeeWei, "Manifest gas cap is weaker than the policy.");

  check(
    deployment.personalVariant.studentId === STUDENT_ID &&
      deployment.personalVariant.gracePeriodSeconds === GRACE_PERIOD_SECONDS.toString() &&
      deployment.personalVariant.defaultAprBps === DEFAULT_APR_BPS &&
      deployment.personalVariant.defaultPenaltyBps === DEFAULT_PENALTY_BPS &&
      deployment.personalVariant.defaultTenorDays === DEFAULT_TENOR_DAYS,
    "Manifest personal variant does not match config/personal.ts.",
  );
  check(
    deployment.plans.length === DEPLOYMENT_PLANS.length &&
      deployment.plans.every((plan, index) => {
        const expected = DEPLOYMENT_PLANS[index]!;
        return (
          plan.planId === index + 1 &&
          plan.tenorDays === expected.tenorDays &&
          plan.aprBps === expected.aprBps &&
          plan.minDeposit === expected.minDeposit.toString() &&
          plan.maxDeposit === expected.maxDeposit.toString() &&
          plan.penaltyBps === expected.penaltyBps
        );
      }),
    "Manifest plans do not match config/plans.ts.",
  );

  const token = await ethers.getContractAt("MockUSDC", deployment.contracts.MockUSDC);
  const vault = await ethers.getContractAt("VaultManager", deployment.contracts.VaultManager);
  const core = await ethers.getContractAt("SavingCore", deployment.contracts.SavingCore);

  check((await token.decimals()) === 6n, "MockUSDC must use 6 decimals.");
  check((await token.symbol()) === "USDC", "MockUSDC symbol must be USDC.");
  check(
    sameAddress(String(await vault.asset()), deployment.contracts.MockUSDC),
    "VaultManager asset does not match the deployed MockUSDC.",
  );
  check(
    sameAddress(String(await core.asset()), deployment.contracts.MockUSDC),
    "SavingCore asset does not match the deployed MockUSDC.",
  );
  check(
    sameAddress(String(await core.vault()), deployment.contracts.VaultManager),
    "SavingCore vault does not match the deployed VaultManager.",
  );
  check(
    sameAddress(String(await vault.core()), deployment.contracts.SavingCore),
    "VaultManager core does not match the deployed SavingCore.",
  );
  check(
    sameAddress(String(await vault.feeReceiver()), deployment.feeReceiver),
    "VaultManager fee receiver does not match the manifest.",
  );
  check((await core.gracePeriod()) === GRACE_PERIOD_SECONDS, "SavingCore grace period does not match.");
  check((await vault.paused()) === false, "VaultManager is paused.");

  const vaultCoreRole = await vault.CORE_ROLE();
  check(
    sameAddress(String(await vault.getRoleAdmin(vaultCoreRole)), String(vaultCoreRole)),
    "CORE_ROLE administration is not locked.",
  );
  check(await vault.hasRole(vaultCoreRole, deployment.contracts.SavingCore), "SavingCore lacks CORE_ROLE.");
  check(!(await vault.hasRole(vaultCoreRole, deployment.deployer)), "Deployer still has CORE_ROLE.");
  check(
    await vault.hasRole(await vault.DEFAULT_ADMIN_ROLE(), deployment.deployer),
    "Deployer lacks DEFAULT_ADMIN_ROLE on VaultManager.",
  );
  check(
    await vault.hasRole(await vault.PAUSER_ROLE(), deployment.deployer),
    "Deployer lacks PAUSER_ROLE on VaultManager.",
  );
  check(
    await core.hasRole(await core.DEFAULT_ADMIN_ROLE(), deployment.deployer),
    "Deployer lacks DEFAULT_ADMIN_ROLE on SavingCore.",
  );
  check(
    await core.hasRole(await core.PLAN_MANAGER_ROLE(), deployment.deployer),
    "Deployer lacks PLAN_MANAGER_ROLE on SavingCore.",
  );

  // Tenor, limits and penalty are fixed once a plan exists, so they always have
  // to match the manifest. APR and `enabled` are mutable by design
  // (`updatePlan`, `setPlanEnabled`), and `createPlan` can add plans, so those
  // are only asserted on a fresh deployment.
  for (const [index, expected] of DEPLOYMENT_PLANS.entries()) {
    const actual = await core.plans(BigInt(index + 1));
    check(actual.tenorDays === BigInt(expected.tenorDays), `Plan ${index + 1}: tenor mismatch.`);
    check(actual.minDeposit === expected.minDeposit, `Plan ${index + 1}: minimum mismatch.`);
    check(actual.maxDeposit === expected.maxDeposit, `Plan ${index + 1}: maximum mismatch.`);
    check(
      actual.earlyWithdrawPenaltyBps === BigInt(expected.penaltyBps),
      `Plan ${index + 1}: penalty mismatch.`,
    );
  }

  if (!allowPostE2e) {
    check((await core.nextPlanId()) === NEXT_PLAN_ID, "Unexpected number of deployment plans.");
    for (const [index, expected] of DEPLOYMENT_PLANS.entries()) {
      const actual = await core.plans(BigInt(index + 1));
      check(actual.aprBps === BigInt(expected.aprBps), `Plan ${index + 1}: APR mismatch.`);
      check(actual.enabled, `Plan ${index + 1}: plan is disabled.`);
    }
  }

  const vaultBalance = await token.balanceOf(deployment.contracts.VaultManager);
  const reserved = await vault.reservedInterest();
  check(vaultBalance > 0n, "The interest vault has no funding.");
  check(reserved <= vaultBalance, "Reserved interest exceeds the vault balance.");

  if (allowPostE2e) {
    console.log("Post-deploy snapshot checks are relaxed by --allow-post-e2e.");
  } else {
    check((await token.totalSupply()) === USDC(150_000), "MockUSDC total supply is not 150,000.");
    check((await core.nextDepositId()) === 1n, "Deposits were opened before N1 verification.");
    check(reserved === 0n, "Reserved interest is not zero on a fresh deployment.");
    check(vaultBalance === USDC(100_000), "Vault funding is not 100,000.");
    check(
      (await token.balanceOf(deployment.deployer)) === USDC(50_000),
      "Deployer token balance is not 50,000.",
    );
  }

  console.log(`Verified ${networkName} deployment on chain ${deployment.chainId}.`);
  console.log(`Contracts: ${addresses.join(", ")}`);
  console.log(
    `Transactions: ${transactions.length}; cost ${totalCostWei} wei of ${policy.maxDeployCostWei} wei cap`,
  );
  console.log(
    `Plans: ${DEPLOYMENT_PLANS.length}; vault balance ${ethers.formatUnits(vaultBalance, 6)} USDC`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
