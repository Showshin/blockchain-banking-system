import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { network } from "hardhat";
import {
  MaxUint256,
  formatUnits,
  parseUnits,
  type Contract,
  type ContractTransactionReceipt,
} from "ethers";

type Deployment = {
  network: string;
  chainId: number;
  contracts: {
    MockUSDC: string;
    VaultManager: string;
    SavingCore: string;
  };
};

type DepositRecord = {
  planId: bigint;
  principal: bigint;
  aprBpsAtOpen: bigint;
  penaltyBpsAtOpen: bigint;
  tenorDays: bigint;
  maturityAt: bigint;
  status: bigint;
};

const ACTIVE = 1n;
const WITHDRAWN = 2n;
const MANUAL_RENEWED = 3n;
const AUTO_RENEWED = 4n;
const USDC = (amount: string | number) => parseUnits(String(amount), 6);

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readDeployment(): Deployment {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const manifestPath = path.join(scriptDir, "..", "deployments", "testnet.json");
  check(fs.existsSync(manifestPath), `Missing deployment manifest: ${manifestPath}`);
  const deployment = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Deployment;
  check(deployment.chainId === 11155111, `Expected Sepolia chain 11155111, got ${deployment.chainId}.`);
  return deployment;
}

function hasEvent(core: Contract, receipt: ContractTransactionReceipt, eventName: string): boolean {
  return receipt.logs.some((log) => {
    try {
      return core.interface.parseLog(log)?.name === eventName;
    } catch {
      return false;
    }
  });
}

async function expectRevert(action: () => Promise<unknown>, label: string): Promise<void> {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error(`${label} should have reverted.`);
}

async function openDeposit(
  core: Contract,
  planId: bigint,
  amount: bigint,
): Promise<{ id: bigint; deposit: DepositRecord; receipt: ContractTransactionReceipt }> {
  const id = (await core.nextDepositId()) as bigint;
  const receipt = (await (await core.openDeposit(planId, amount)).wait()) as ContractTransactionReceipt;
  check(hasEvent(core, receipt, "DepositOpened"), "DepositOpened event is missing.");
  return {
    id,
    deposit: (await core.deposits(id)) as DepositRecord,
    receipt,
  };
}

async function runSepoliaTransactions(
  core: Contract,
  token: Contract,
  signerAddress: string,
) {
  const startingBalance = (await token.balanceOf(signerAddress)) as bigint;
  check(startingBalance >= USDC(600), "Deployer does not have enough MockUSDC for the smoke flow.");

  await (await token.approve(core.target, MaxUint256)).wait();

  const first = await openDeposit(core, 1n, USDC(100));
  check(first.deposit.status === ACTIVE, "Opened deposit is not active.");
  check(first.deposit.principal === USDC(100), "Opened principal is incorrect.");
  await expectRevert(() => core.withdrawAtMaturity(first.id), "Early maturity withdrawal");

  const earlyReceipt = (await (await core.earlyWithdraw(first.id)).wait()) as ContractTransactionReceipt;
  check(hasEvent(core, earlyReceipt, "Withdrawn"), "Withdrawn event is missing.");
  const settled = (await core.deposits(first.id)) as DepositRecord;
  check(settled.status === WITHDRAWN, "Early withdrawal did not close the deposit.");

  const retained = await openDeposit(core, 2n, USDC(500));
  check(retained.deposit.status === ACTIVE, "The retained test deposit is not active.");

  return {
    mode: "sepolia-transactions",
    explorer: "https://sepolia.etherscan.io",
    earlyWithdrawal: {
      depositId: first.id.toString(),
      openTx: first.receipt.hash,
      withdrawTx: earlyReceipt.hash,
      status: settled.status.toString(),
      penaltyUsdc: formatUnits((await core.earlyWithdrawalPenalty(first.id)) as bigint, 6),
    },
    activeDeposit: {
      depositId: retained.id.toString(),
      openTx: retained.receipt.hash,
      planId: retained.deposit.planId.toString(),
      principalUsdc: formatUnits(retained.deposit.principal, 6),
      maturityAt: retained.deposit.maturityAt.toString(),
    },
  };
}

async function runForkFlows(
  core: Contract,
  token: Contract,
  signerAddress: string,
  networkHelpers: Awaited<ReturnType<typeof network.create>>["networkHelpers"],
) {
  await (await token.mint(signerAddress, USDC(20_000))).wait();
  await (await token.approve(core.target, MaxUint256)).wait();

  const maturity = await openDeposit(core, 1n, USDC(1_000));
  await networkHelpers.time.increaseTo(Number(maturity.deposit.maturityAt) + 1);
  const maturityReceipt = (await (
    await core.withdrawAtMaturity(maturity.id)
  ).wait()) as ContractTransactionReceipt;
  check(hasEvent(core, maturityReceipt, "Withdrawn"), "Maturity Withdrawn event is missing.");
  const matured = (await core.deposits(maturity.id)) as DepositRecord;
  check(matured.status === WITHDRAWN, "Maturity withdrawal did not close the deposit.");

  const manual = await openDeposit(core, 1n, USDC(1_000));
  await networkHelpers.time.increaseTo(Number(manual.deposit.maturityAt) + 1);
  const manualReceipt = (await (
    await core.renewDeposit(manual.id, 3n)
  ).wait()) as ContractTransactionReceipt;
  check(hasEvent(core, manualReceipt, "Renewed"), "Manual Renewed event is missing.");
  const manualOld = (await core.deposits(manual.id)) as DepositRecord;
  const manualNewId = (await core.nextDepositId()) - 1n;
  const manualNew = (await core.deposits(manualNewId)) as DepositRecord;
  check(manualOld.status === MANUAL_RENEWED, "Old deposit is not marked ManualRenewed.");
  check(manualNew.status === ACTIVE && manualNew.planId === 3n, "Manual renewal target is incorrect.");

  const automatic = await openDeposit(core, 1n, USDC(1_000));
  const gracePeriod = (await core.gracePeriod()) as bigint;
  await networkHelpers.time.increaseTo(
    Number((automatic.deposit.maturityAt as bigint) + gracePeriod),
  );
  const automaticReceipt = (await (
    await core.autoRenewDeposit(automatic.id)
  ).wait()) as ContractTransactionReceipt;
  check(hasEvent(core, automaticReceipt, "Renewed"), "Auto-renew Renewed event is missing.");
  const automaticOld = (await core.deposits(automatic.id)) as DepositRecord;
  const automaticNewId = (await core.nextDepositId()) - 1n;
  const automaticNew = (await core.deposits(automaticNewId)) as DepositRecord;
  check(automaticOld.status === AUTO_RENEWED, "Old deposit is not marked AutoRenewed.");
  check(automaticNew.planId === automatic.deposit.planId, "Auto-renew changed the plan.");
  check(
    automaticNew.aprBpsAtOpen === automatic.deposit.aprBpsAtOpen,
    "Auto-renew did not preserve the original APR.",
  );
  check(
    automaticNew.tenorDays === automatic.deposit.tenorDays,
    "Auto-renew did not preserve the original tenor.",
  );

  return {
    mode: "sepolia-fork-time-travel",
    maturityWithdrawal: {
      depositId: maturity.id.toString(),
      tx: maturityReceipt.hash,
      status: matured.status.toString(),
    },
    manualRenewal: {
      oldDepositId: manual.id.toString(),
      newDepositId: manualNewId.toString(),
      tx: manualReceipt.hash,
      newPrincipalUsdc: formatUnits(manualNew.principal, 6),
      newPlanId: manualNew.planId.toString(),
    },
    autoRenewal: {
      oldDepositId: automatic.id.toString(),
      newDepositId: automaticNewId.toString(),
      tx: automaticReceipt.hash,
      lockedAprBps: automaticNew.aprBpsAtOpen.toString(),
      tenorDays: automaticNew.tenorDays.toString(),
    },
  };
}

async function main() {
  const connection = await network.create();
  const { ethers, networkHelpers, networkName } = connection;
  const deployment = readDeployment();
  const chain = await ethers.provider.getNetwork();
  check(chain.chainId === 11155111n, `Expected Sepolia chain 11155111, got ${chain.chainId}.`);
  check(
    networkName === "testnet" || networkName === "sepoliaFork",
    `Run this script on testnet or sepoliaFork, not ${networkName}.`,
  );

  const [signer] = await ethers.getSigners();
  check(signer, "No signer is configured.");
  const core = await ethers.getContractAt("SavingCore", deployment.contracts.SavingCore);
  const token = await ethers.getContractAt("MockUSDC", deployment.contracts.MockUSDC);
  const [latestBlock, coreCode] = await Promise.all([
    ethers.provider.getBlockNumber(),
    ethers.provider.getCode(deployment.contracts.SavingCore),
  ]);
  check(
    coreCode !== "0x",
    `No SavingCore bytecode at ${deployment.contracts.SavingCore} on ${networkName} at block ${latestBlock}.`,
  );
  const result =
    networkName === "sepoliaFork"
      ? await runForkFlows(core, token, signer.address, networkHelpers)
      : await runSepoliaTransactions(core, token, signer.address);

  console.log(JSON.stringify({ networkName, signer: signer.address, ...result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
