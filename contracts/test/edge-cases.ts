import { expect } from "chai";
import type { Contract } from "ethers";
import { anyValue } from "@nomicfoundation/hardhat-ethers-chai-matchers/withArgs";
import { network } from "hardhat";
import { GRACE_PERIOD_SECONDS } from "../config/personal.ts";
import { deployBankFixture, openDeposit, USDC, withSigner } from "./fixtures.ts";

const { ethers, networkHelpers } = await network.create();
const { time } = networkHelpers;
const loadBankFixture = () => deployBankFixture(ethers);
const loadFixture = networkHelpers.loadFixture;

const ACTIVE = 1n;
const MANUAL_RENEWED = 3n;
const AUTO_RENEWED = 4n;

async function impersonateCore(core: Contract) {
  const address = core.target as string;
  await networkHelpers.impersonateAccount(address);
  await networkHelpers.setBalance(address, 10n ** 18n);
  return ethers.getSigner(address);
}

describe("SavingCore edge cases", function () {
  it("restricts every plan-management entry point to PLAN_MANAGER_ROLE", async function () {
    const { core, outsider } = await loadFixture(loadBankFixture);
    const role = await core.PLAN_MANAGER_ROLE();

    await expect(withSigner(core, outsider).createPlan(30, 250, 0, 0, 0))
      .to.be.revertedWithCustomError(core, "AccessControlUnauthorizedAccount")
      .withArgs(outsider.address, role);
    await expect(withSigner(core, outsider).setPlanEnabled(1, false))
      .to.be.revertedWithCustomError(core, "AccessControlUnauthorizedAccount")
      .withArgs(outsider.address, role);
    await expect(core.setPlanEnabled(99, false)).to.be.revertedWith("Core: unknown plan");
  });

  it("treats maxDeposit = 0 as unlimited and accepts the exact min/max boundaries", async function () {
    const { core, token, depositor, recipient } = await loadFixture(loadBankFixture);
    const unlimitedPlan = await core.nextPlanId();
    await core.createPlan(30, 225, USDC(100), 0, 400);
    await token.mint(depositor.address, USDC(50_000));

    await expect(withSigner(core, depositor).openDeposit(1, USDC(100_000))).to.emit(
      core,
      "DepositOpened",
    );
    await expect(withSigner(core, recipient).openDeposit(1, USDC(100))).to.emit(
      core,
      "DepositOpened",
    );
    await token.mint(depositor.address, USDC(100_000));
    await expect(withSigner(core, depositor).openDeposit(unlimitedPlan, USDC(120_000))).to.emit(
      core,
      "DepositOpened",
    );
  });

  it("pays maturity to the current NFT owner after a transfer", async function () {
    const { core, token, depositor, recipient } = await loadFixture(loadBankFixture);
    const { depositId, deposit } = await openDeposit(core, depositor, USDC(1_000));
    const interest = await core.interestAtMaturity(depositId);

    await withSigner(core, depositor).transferFrom(
      depositor.address,
      recipient.address,
      depositId,
    );
    await time.increaseTo(Number(deposit.maturityAt));

    await expect(withSigner(core, depositor).withdrawAtMaturity(depositId)).to.be.revertedWith(
      "Core: not certificate owner",
    );

    const before = await token.balanceOf(recipient.address);
    await expect(withSigner(core, recipient).withdrawAtMaturity(depositId))
      .to.emit(core, "Withdrawn")
      .withArgs(depositId, recipient.address, USDC(1_000), interest, false);
    expect(await token.balanceOf(recipient.address)).to.equal(before + USDC(1_000) + interest);
  });

  it("pays early withdrawal to the current NFT owner and penalty to the fee receiver", async function () {
    const { core, token, depositor, recipient, feeAccount } = await loadFixture(loadBankFixture);
    const { depositId } = await openDeposit(core, depositor, USDC(1_000));

    await withSigner(core, depositor).transferFrom(
      depositor.address,
      recipient.address,
      depositId,
    );
    await time.increase(10 * 86_400);

    await expect(withSigner(core, depositor).earlyWithdraw(depositId)).to.be.revertedWith(
      "Core: not certificate owner",
    );

    const recipientBefore = await token.balanceOf(recipient.address);
    const feeBefore = await token.balanceOf(feeAccount.address);
    await withSigner(core, recipient).earlyWithdraw(depositId);

    expect(await token.balanceOf(recipient.address)).to.equal(
      recipientBefore + USDC(1_000) - USDC(40),
    );
    expect(await token.balanceOf(feeAccount.address)).to.equal(feeBefore + USDC(40));
  });

  it("renews to the current NFT owner and rejects unknown plans or non-owners", async function () {
    const { core, depositor, recipient, outsider } = await loadFixture(loadBankFixture);
    const { depositId, deposit } = await openDeposit(core, depositor, USDC(1_000));

    await withSigner(core, depositor).transferFrom(
      depositor.address,
      recipient.address,
      depositId,
    );
    await time.increaseTo(Number(deposit.maturityAt));

    await expect(withSigner(core, depositor).renewDeposit(depositId, 2)).to.be.revertedWith(
      "Core: not certificate owner",
    );
    await expect(withSigner(core, recipient).renewDeposit(depositId, 99)).to.be.revertedWith(
      "Core: plan unavailable",
    );

    const interest = await core.interestAtMaturity(depositId);
    const newDepositId = await core.nextDepositId();
    await expect(withSigner(core, recipient).renewDeposit(depositId, 2))
      .to.emit(core, "Renewed")
      .withArgs(depositId, newDepositId, USDC(1_000) + interest, 2);

    expect(await core.ownerOf(newDepositId)).to.equal(recipient.address);
    expect((await core.deposits(depositId)).status).to.equal(MANUAL_RENEWED);
  });

  it("auto-renews after the original plan is disabled", async function () {
    const { core, depositor } = await loadFixture(loadBankFixture);
    const { depositId, deposit } = await openDeposit(core, depositor, USDC(1_000));
    await core.setPlanEnabled(1, false);
    await time.increaseTo(Number(deposit.maturityAt + GRACE_PERIOD_SECONDS));
    const newDepositId = await core.nextDepositId();

    await expect(core.autoRenewDeposit(depositId)).to.emit(core, "Renewed");

    const renewed = await core.deposits(newDepositId);
    expect(renewed.planId).to.equal(1n);
    expect(renewed.aprBpsAtOpen).to.equal(deposit.aprBpsAtOpen);
    expect(renewed.tenorDays).to.equal(deposit.tenorDays);
    expect((await core.deposits(depositId)).status).to.equal(AUTO_RENEWED);
  });

  it("allows a top-up to the exact maximum and rejects one unit above", async function () {
    const { core, depositor } = await loadFixture(loadBankFixture);
    const { depositId } = await openDeposit(core, depositor, USDC(1_000));

    await expect(withSigner(core, depositor).topUpDeposit(depositId, USDC(99_000)))
      .to.emit(core, "DepositToppedUp")
      .withArgs(depositId, depositor.address, USDC(99_000), USDC(100_000), anyValue);

    await expect(withSigner(core, depositor).topUpDeposit(depositId, 1)).to.be.revertedWith(
      "Core: above maximum",
    );
    await expect(withSigner(core, depositor).topUpDeposit(999, 1)).to.be.revertedWith(
      "Core: deposit inactive",
    );
  });

  it("rejects claims for unknown deposits", async function () {
    const { core } = await loadFixture(loadBankFixture);
    await expect(core.claimInterest(999)).to.be.revertedWith("Core: no pending interest");
  });

  it("withdraws at maturity with the weighted interest from a top-up", async function () {
    const { core, token, depositor } = await loadFixture(loadBankFixture);
    const { depositId, deposit } = await openDeposit(core, depositor, USDC(1_000));
    await time.increase(30 * 86_400);
    await withSigner(core, depositor).topUpDeposit(depositId, USDC(500));
    const expectedInterest = await core.interestAtMaturity(depositId);
    await time.increaseTo(Number(deposit.maturityAt));

    const before = await token.balanceOf(depositor.address);
    await expect(withSigner(core, depositor).withdrawAtMaturity(depositId))
      .to.emit(core, "Withdrawn")
      .withArgs(depositId, depositor.address, USDC(1_500), expectedInterest, false);
    expect(await token.balanceOf(depositor.address)).to.equal(
      before + USDC(1_500) + expectedInterest,
    );
  });

  it("renews the remaining principal after a partial early withdrawal", async function () {
    const { core, depositor } = await loadFixture(loadBankFixture);
    const { depositId, deposit } = await openDeposit(core, depositor, USDC(1_000));
    await time.increase(10 * 86_400);
    await withSigner(core, depositor).earlyWithdrawPartial(depositId, USDC(200));
    const remaining = USDC(800);
    const interest = await core.interestAtMaturity(depositId);
    await time.increaseTo(Number(deposit.maturityAt));

    const newDepositId = await core.nextDepositId();
    await expect(withSigner(core, depositor).renewDeposit(depositId, 2))
      .to.emit(core, "Renewed")
      .withArgs(depositId, newDepositId, remaining + interest, 2);
    expect((await core.deposits(newDepositId)).principal).to.equal(remaining + interest);
  });

  it("auto-renews the remaining principal after a partial early withdrawal", async function () {
    const { core, depositor } = await loadFixture(loadBankFixture);
    const { depositId, deposit } = await openDeposit(core, depositor, USDC(1_000));
    await time.increase(10 * 86_400);
    await withSigner(core, depositor).earlyWithdrawPartial(depositId, USDC(200));
    const remaining = USDC(800);
    const interest = await core.interestAtMaturity(depositId);
    await time.increaseTo(Number(deposit.maturityAt + GRACE_PERIOD_SECONDS));

    const newDepositId = await core.nextDepositId();
    await expect(core.autoRenewDeposit(depositId)).to.emit(core, "Renewed");
    expect((await core.deposits(newDepositId)).principal).to.equal(remaining + interest);
    expect((await core.deposits(depositId)).status).to.equal(AUTO_RENEWED);
  });

  it("confirms the documented renew boundary: minDeposit is not re-checked", async function () {
    const { core, depositor } = await loadFixture(loadBankFixture);
    const highMinimum = await core.nextPlanId();
    await core.createPlan(30, 225, USDC(10_000), 0, 0);
    const { depositId, deposit } = await openDeposit(core, depositor, USDC(100));
    await time.increaseTo(Number(deposit.maturityAt));

    const newDepositId = await core.nextDepositId();
    await expect(withSigner(core, depositor).renewDeposit(depositId, highMinimum)).to.emit(
      core,
      "Renewed",
    );
    expect((await core.deposits(newDepositId)).principal).to.be.lessThan(USDC(10_000));
    expect((await core.deposits(depositId)).status).to.equal(MANUAL_RENEWED);
  });

  it("confirms the documented renew boundary: maxDeposit is not re-checked", async function () {
    const { core, depositor } = await loadFixture(loadBankFixture);
    const cappedPlan = await core.nextPlanId();
    await core.createPlan(30, 1_000, 0, USDC(1_000), 0);
    const { depositId, deposit } = await openDeposit(core, depositor, USDC(1_000), cappedPlan);
    await time.increaseTo(Number(deposit.maturityAt));

    const newDepositId = await core.nextDepositId();
    await expect(withSigner(core, depositor).renewDeposit(depositId, cappedPlan)).to.emit(
      core,
      "Renewed",
    );

    const renewed = await core.deposits(newDepositId);
    expect(renewed.principal).to.be.greaterThan(USDC(1_000));
    expect(renewed.status).to.equal(ACTIVE);
  });
});

describe("VaultManager edge cases", function () {
  it("emits pause/unpause and blocks reserve/pay while paused", async function () {
    const { admin, core, depositor, vault } = await loadFixture(loadBankFixture);
    const coreSigner = await impersonateCore(core);
    const vaultAsCore = withSigner(vault, coreSigner);

    await expect(withSigner(vault, admin).pause())
      .to.emit(vault, "Paused")
      .withArgs(admin.address);
    await expect(vaultAsCore.reserveInterest(USDC(1))).to.be.revertedWithCustomError(
      vault,
      "EnforcedPause",
    );
    await expect(
      vaultAsCore.payInterest(depositor.address, USDC(1)),
    ).to.be.revertedWithCustomError(vault, "EnforcedPause");

    await expect(withSigner(vault, admin).unpause())
      .to.emit(vault, "Unpaused")
      .withArgs(admin.address);
  });

  it("restricts fee-receiver changes to the admin", async function () {
    const { outsider, recipient, vault } = await loadFixture(loadBankFixture);
    await expect(withSigner(vault, outsider).setFeeReceiver(recipient.address))
      .to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount")
      .withArgs(outsider.address, await vault.DEFAULT_ADMIN_ROLE());
  });
});
