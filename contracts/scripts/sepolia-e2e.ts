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

function eventArg(
  core: Contract,
  receipt: ContractTransactionReceipt,
  eventName: string,
  argName: string,
): bigint {
  for (const log of receipt.logs) {
    try {
      const parsed = core.interface.parseLog(log);
      if (parsed?.name === eventName) return parsed.args[argName] as bigint;
    } catch {
      // A transaction may contain logs from the token as well as SavingCore.
    }
  }
  throw new Error(`${eventName} event is missing.`);
}

async function readDeposit(
  core: Contract,
  depositId: bigint,
  blockNumber?: number,
): Promise<DepositRecord> {
  return (blockNumber === undefined
    ? await core.deposits(depositId)
    : await core.deposits(depositId, { blockTag: blockNumber })) as DepositRecord;
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
  const receipt = (await (await core.openDeposit(planId, amount)).wait()) as ContractTransactionReceipt;
  check(hasEvent(core, receipt, "DepositOpened"), "DepositOpened event is missing.");
  const id = eventArg(core, receipt, "DepositOpened", "depositId");
  return {
    id,
    deposit: await readDeposit(core, id, receipt.blockNumber),
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
  const settled = await readDeposit(core, first.id, earlyReceipt.blockNumber);
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

async function main() {
  const connection = await network.create();
  const { ethers, networkName } = connection;
  const deployment = readDeployment();
  const chain = await ethers.provider.getNetwork();
  check(chain.chainId === 11155111n, `Expected Sepolia chain 11155111, got ${chain.chainId}.`);
  check(networkName === "testnet", `Run this script on testnet, not ${networkName}.`);

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
  const result = await runSepoliaTransactions(core, token, signer.address);

  console.log(JSON.stringify({ networkName, signer: signer.address, ...result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
