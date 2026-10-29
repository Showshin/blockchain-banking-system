import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { network } from "hardhat";
import { MaxUint256, getAddress, parseUnits } from "ethers";
import {
  DEFAULT_APR_BPS,
  DEFAULT_PENALTY_BPS,
  DEFAULT_TENOR_DAYS,
  GRACE_PERIOD_SECONDS,
  STUDENT_ID,
} from "../config/personal";

const USDC = (amount: string | number) => parseUnits(String(amount), 6);

async function main() {
  const { ethers, networkName } = await network.create();
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  if (!deployer) throw new Error("No deployer account is configured for this network.");

  const chain = await ethers.provider.getNetwork();
  if (chain.chainId === 1n) {
    throw new Error("Refusing to deploy to Ethereum mainnet. Select an explicit testnet network.");
  }
  const txOverrides = networkName === "testnet" ? { gasPrice: 100_000_000n } : {};

  const configuredFeeReceiver = process.env.FEE_RECEIVER_ADDRESS?.trim();
  const feeReceiver = configuredFeeReceiver
    ? getAddress(configuredFeeReceiver)
    : (signers[1]?.address ?? deployer.address);
  const deploymentBlock = await ethers.provider.getBlockNumber();

  const token = await ethers.deployContract("MockUSDC", [], txOverrides);
  await token.waitForDeployment();
  const tokenDeploymentTx = token.deploymentTransaction();

  const vault = await ethers.deployContract(
    "VaultManager",
    [token.target, deployer.address, feeReceiver],
    txOverrides,
  );
  await vault.waitForDeployment();
  const vaultDeploymentTx = vault.deploymentTransaction();

  const core = await ethers.deployContract(
    "SavingCore",
    [token.target, vault.target, GRACE_PERIOD_SECONDS],
    txOverrides,
  );
  await core.waitForDeployment();
  const coreDeploymentTx = core.deploymentTransaction();

  const coreRoleTx = await (
    await vault.grantRole(await vault.CORE_ROLE(), core.target, txOverrides)
  ).wait();
  const mintTx = await (await token.mint(deployer.address, USDC(150_000), txOverrides)).wait();
  const approveTx = await (await token.approve(vault.target, MaxUint256, txOverrides)).wait();
  const fundTx = await (await vault.fundVault(USDC(100_000), txOverrides)).wait();

  const planInputs = [
    { tenorDays: 30, aprBps: 175, min: USDC(100), max: USDC(25_000), penaltyBps: 200 },
    {
      tenorDays: DEFAULT_TENOR_DAYS,
      aprBps: DEFAULT_APR_BPS,
      min: USDC(500),
      max: USDC(100_000),
      penaltyBps: DEFAULT_PENALTY_BPS,
    },
    { tenorDays: 180, aprBps: 300, min: USDC(1_000), max: USDC(250_000), penaltyBps: 450 },
    { tenorDays: 365, aprBps: 400, min: USDC(2_500), max: USDC(500_000), penaltyBps: 500 },
  ];

  const planTransactions: string[] = [];
  for (const plan of planInputs) {
    const receipt = await (
      await core.createPlan(
        plan.tenorDays,
        plan.aprBps,
        plan.min,
        plan.max,
        plan.penaltyBps,
        txOverrides,
      )
    ).wait();
    planTransactions.push(receipt.hash);
  }
  const completedBlock = await ethers.provider.getBlockNumber();

  const deployment = {
    network: networkName,
    chainId: Number(chain.chainId),
    deploymentBlock,
    completedBlock,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    feeReceiver,
    explorerBaseUrl: process.env.EXPLORER_BASE_URL?.trim() || null,
    contracts: {
      MockUSDC: token.target,
      VaultManager: vault.target,
      SavingCore: core.target,
    },
    transactions: {
      MockUSDC: tokenDeploymentTx?.hash ?? null,
      VaultManager: vaultDeploymentTx?.hash ?? null,
      SavingCore: coreDeploymentTx?.hash ?? null,
      grantCoreRole: coreRoleTx.hash,
      mint: mintTx.hash,
      approveVault: approveTx.hash,
      fundVault: fundTx.hash,
      createPlans: planTransactions,
    },
    personalVariant: {
      studentId: STUDENT_ID,
      gracePeriodSeconds: GRACE_PERIOD_SECONDS.toString(),
      defaultAprBps: DEFAULT_APR_BPS,
      defaultPenaltyBps: DEFAULT_PENALTY_BPS,
      defaultTenorDays: DEFAULT_TENOR_DAYS,
    },
    plans: planInputs.map((plan, index) => ({
      planId: index + 1,
      tenorDays: plan.tenorDays,
      aprBps: plan.aprBps,
      minDeposit: plan.min.toString(),
      maxDeposit: plan.max.toString(),
      penaltyBps: plan.penaltyBps,
    })),
  };

  const outputDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "deployments");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${networkName}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(deployment, null, 2)}\n`);

  console.log(JSON.stringify(deployment, null, 2));
  console.log(`Deployment written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
