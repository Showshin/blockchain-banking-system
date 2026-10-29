import type { network } from "hardhat";
import { parseUnits, type Contract } from "ethers";
import {
  DEFAULT_APR_BPS,
  DEFAULT_PENALTY_BPS,
  DEFAULT_TENOR_DAYS,
  GRACE_PERIOD_SECONDS,
} from "../config/personal";

export const USDC = (amount: string | number) => parseUnits(String(amount), 6);

type TestEthers = Awaited<ReturnType<typeof network.create>>["ethers"];
type TestSigner = Awaited<ReturnType<TestEthers["getSigners"]>>[number];

export function withSigner(contract: Contract, signer: TestSigner): Contract {
  return contract.connect(signer) as unknown as Contract;
}

export async function deployBankFixture(
  ethers: TestEthers,
  options: { vaultFunding?: bigint } = {},
) {
  const [admin, depositor, recipient, feeAccount, outsider] = await ethers.getSigners();
  const vaultFunding = options.vaultFunding ?? USDC(2_000);

  const token = (await ethers.deployContract("MockUSDC")) as unknown as Contract;
  const vault = (await ethers.deployContract("VaultManager", [
    token.target,
    admin.address,
    feeAccount.address,
  ])) as unknown as Contract;
  const core = (await ethers.deployContract("SavingCore", [
    token.target,
    vault.target,
    GRACE_PERIOD_SECONDS,
  ])) as unknown as Contract;

  await vault.grantRole(await vault.CORE_ROLE(), core.target);

  await token.mint(admin.address, USDC(50_000));
  await token.mint(depositor.address, USDC(100_000));
  await token.mint(recipient.address, USDC(1_000));

  await withSigner(token, admin).approve(vault.target, ethers.MaxUint256);
  await withSigner(token, depositor).approve(core.target, ethers.MaxUint256);
  await withSigner(token, recipient).approve(core.target, ethers.MaxUint256);

  if (vaultFunding > 0n) {
    await vault.fundVault(vaultFunding);
  }
  await core.createPlan(
    DEFAULT_TENOR_DAYS,
    DEFAULT_APR_BPS,
    USDC(100),
    USDC(100_000),
    DEFAULT_PENALTY_BPS,
  );
  await core.createPlan(180, 300, USDC(100), USDC(200_000), 450);

  return {
    admin,
    depositor,
    recipient,
    feeAccount,
    outsider,
    token,
    vault,
    core,
  };
}

export async function openDeposit(
  core: Contract,
  signer: TestSigner,
  amount: bigint,
  planId = 1n,
) {
  const depositId = (await core.nextDepositId()) as bigint;
  await withSigner(core, signer).openDeposit(planId, amount);
  return {
    depositId,
    deposit: (await core.deposits(depositId)) as {
      planId: bigint;
      principal: bigint;
      aprBpsAtOpen: bigint;
      penaltyBpsAtOpen: bigint;
      tenorDays: bigint;
      openedAt: bigint;
      maturityAt: bigint;
      status: bigint;
      principalSeconds: bigint;
    },
  };
}
