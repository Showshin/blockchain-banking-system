import { expect } from "chai";
import type { Contract } from "ethers";
import { network } from "hardhat";
import { GRACE_PERIOD_SECONDS } from "../config/personal.ts";
import { deployBankFixture, openDeposit, USDC, withSigner } from "./fixtures.ts";

const { ethers, networkHelpers } = await network.create();
const { time } = networkHelpers;
const loadBankFixture = () => deployBankFixture(ethers);
const loadShortVaultFixture = () => deployBankFixture(ethers, { vaultFunding: USDC(1) });

describe("VaultManager", function () {
  it("rejects zero constructor dependencies", async function () {
    const [admin, feeAccount] = await ethers.getSigners();
    const token = await ethers.deployContract("MockUSDC");

    await expect(
      ethers.deployContract("VaultManager", [ethers.ZeroAddress, admin.address, feeAccount.address]),
    ).to.be.revertedWith("Vault: zero asset");
    await expect(
      ethers.deployContract("VaultManager", [token.target, ethers.ZeroAddress, feeAccount.address]),
    ).to.be.revertedWith("Vault: zero admin");
    await expect(
      ethers.deployContract("VaultManager", [token.target, admin.address, ethers.ZeroAddress]),
    ).to.be.revertedWith("Vault: zero fee receiver");
  });

  it("accepts admin funding and exposes an admin withdrawal", async function () {
    const { admin, vault, token } = await networkHelpers.loadFixture(loadBankFixture);

    await expect(withSigner(vault, admin).fundVault(USDC(500)))
      .to.emit(vault, "VaultFunded")
      .withArgs(admin.address, USDC(500));
    expect(await token.balanceOf(vault.target)).to.equal(USDC(2_500));

    await expect(withSigner(vault, admin).withdrawVault(USDC(250)))
      .to.emit(vault, "VaultWithdrawn")
      .withArgs(admin.address, USDC(250));
    expect(await token.balanceOf(vault.target)).to.equal(USDC(2_250));
    await expect(withSigner(vault, admin).fundVault(0)).to.be.revertedWith("Vault: zero amount");
    await expect(withSigner(vault, admin).withdrawVault(0)).to.be.revertedWith("Vault: zero amount");
  });

  it("rejects funding and withdrawals from non-admin accounts", async function () {
    const { outsider, vault } = await networkHelpers.loadFixture(loadBankFixture);

    await expect(withSigner(vault, outsider).fundVault(USDC(1)))
      .to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount")
      .withArgs(outsider.address, await vault.DEFAULT_ADMIN_ROLE());
    await expect(withSigner(vault, outsider).withdrawVault(USDC(1)))
      .to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount")
      .withArgs(outsider.address, await vault.DEFAULT_ADMIN_ROLE());
  });

  it("protects the configured fee receiver", async function () {
    const { admin, recipient, feeAccount, vault } = await networkHelpers.loadFixture(loadBankFixture);

    expect(await vault.feeReceiver()).to.equal(feeAccount.address);
    await expect(withSigner(vault, admin).setFeeReceiver(recipient.address))
      .to.emit(vault, "FeeReceiverUpdated")
      .withArgs(feeAccount.address, recipient.address);
    expect(await vault.feeReceiver()).to.equal(recipient.address);
    await expect(withSigner(vault, admin).setFeeReceiver(ethers.ZeroAddress)).to.be.revertedWith(
      "Vault: zero fee receiver",
    );
  });

  it("only allows the pauser role to pause and blocks outbound funds", async function () {
    const { admin, outsider, token, vault } = await networkHelpers.loadFixture(loadBankFixture);

    await expect(withSigner(vault, outsider).pause())
      .to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount")
      .withArgs(outsider.address, await vault.PAUSER_ROLE());

    await withSigner(vault, admin).pause();
    expect(await vault.paused()).to.equal(true);
    await expect(withSigner(vault, admin).withdrawVault(USDC(1))).to.be.revertedWithCustomError(
      vault,
      "EnforcedPause",
    );

    await token.mint(admin.address, USDC(1));
    await withSigner(token, admin).approve(vault.target, USDC(1));
    await expect(withSigner(vault, admin).fundVault(USDC(1))).to.emit(vault, "VaultFunded");

    await withSigner(vault, admin).unpause();
    expect(await vault.paused()).to.equal(false);
  });

  it("only lets the configured SavingCore call interest functions", async function () {
    const { admin, core, depositor, vault } = await networkHelpers.loadFixture(loadBankFixture);
    const coreRole = await vault.CORE_ROLE();

    await expect(withSigner(vault, admin).payInterest(depositor.address, USDC(1)))
      .to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount")
      .withArgs(admin.address, coreRole);
    await expect(withSigner(vault, admin).reserveInterest(USDC(1)))
      .to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount")
      .withArgs(admin.address, coreRole);
    await expect(withSigner(vault, admin).releaseInterest(USDC(1)))
      .to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount")
      .withArgs(admin.address, coreRole);

    await expect(withSigner(vault, admin).withdrawVault(USDC(99_999))).to.be.revertedWith(
      "Vault: insufficient balance",
    );

    await networkHelpers.impersonateAccount(core.target as string);
    await networkHelpers.setBalance(core.target as string, 10n ** 18n);
    const coreSigner = await ethers.getSigner(core.target as string);
    const vaultAsCore = withSigner(vault, coreSigner);

    await expect(vaultAsCore.payInterest(ethers.ZeroAddress, USDC(1))).to.be.revertedWith(
      "Vault: zero recipient",
    );
    await expect(vaultAsCore.payInterest(depositor.address, 0)).to.be.revertedWith(
      "Vault: zero amount",
    );
    await expect(vaultAsCore.payInterest(depositor.address, USDC(1))).to.be.revertedWith(
      "Vault: interest not reserved",
    );

    await expect(vaultAsCore.reserveInterest(USDC(1)))
      .to.emit(vault, "InterestReserved")
      .withArgs(USDC(1), USDC(1));
    await expect(vaultAsCore.payInterest(depositor.address, USDC(2))).to.be.revertedWith(
      "Vault: interest not reserved",
    );
    await expect(vaultAsCore.payInterest(depositor.address, USDC(1)))
      .to.emit(vault, "InterestPaid")
      .withArgs(depositor.address, USDC(1));
    expect(await vault.reservedInterest()).to.equal(0n);
  });

  it("locks CORE_ROLE administration to the configured core", async function () {
    const { admin, core, outsider, vault } = await networkHelpers.loadFixture(loadBankFixture);
    const coreRole = await vault.CORE_ROLE();

    expect(await vault.core()).to.equal(core.target);
    expect(await vault.getRoleAdmin(coreRole)).to.equal(coreRole);
    expect(await vault.hasRole(coreRole, core.target)).to.equal(true);

    await expect(withSigner(vault, admin).grantRole(coreRole, admin.address))
      .to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount")
      .withArgs(admin.address, coreRole);
    await expect(withSigner(vault, outsider).setCoreOnce(core.target))
      .to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount")
      .withArgs(outsider.address, await vault.DEFAULT_ADMIN_ROLE());
    await expect(withSigner(vault, admin).revokeRole(coreRole, core.target))
      .to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount")
      .withArgs(admin.address, coreRole);
    await expect(withSigner(vault, admin).setCoreOnce(core.target)).to.be.revertedWith(
      "Vault: core already set",
    );
  });

  it("validates the one-time core setup", async function () {
    const [admin, feeAccount] = await ethers.getSigners();
    const token = await ethers.deployContract("MockUSDC");
    const vault = await ethers.deployContract("VaultManager", [
      token.target,
      admin.address,
      feeAccount.address,
    ]);
    const core = await ethers.deployContract("SavingCore", [
      token.target,
      vault.target,
      GRACE_PERIOD_SECONDS,
    ]);

    await expect(vault.setCoreOnce(ethers.ZeroAddress)).to.be.revertedWith("Vault: invalid core");
    await expect(vault.setCoreOnce(admin.address)).to.be.revertedWith("Vault: invalid core");
    await expect(vault.setCoreOnce(vault.target)).to.be.revertedWith("Vault: invalid core");
    await expect(vault.setCoreOnce(core.target))
      .to.emit(vault, "CoreRoleLocked")
      .withArgs(core.target);
    expect(await vault.core()).to.equal(core.target);
    expect(await vault.hasRole(await vault.CORE_ROLE(), core.target)).to.equal(true);
  });

  it("tracks reserved interest through the core role only", async function () {
    const { core, outsider, vault } = await networkHelpers.loadFixture(loadBankFixture);
    const coreRole = await vault.CORE_ROLE();

    await expect(withSigner(vault, outsider).reserveInterest(USDC(100)))
      .to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount")
      .withArgs(outsider.address, coreRole);
    await expect(withSigner(vault, outsider).releaseInterest(USDC(100)))
      .to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount")
      .withArgs(outsider.address, coreRole);

    await networkHelpers.impersonateAccount(core.target as string);
    await networkHelpers.setBalance(core.target as string, 10n ** 18n);
    const coreSigner = await ethers.getSigner(core.target as string);
    const vaultAsCore = withSigner(vault, coreSigner);

    await expect(vaultAsCore.reserveInterest(USDC(100)))
      .to.emit(vault, "InterestReserved")
      .withArgs(USDC(100), USDC(100));
    expect(await vault.reservedInterest()).to.equal(USDC(100));

    await expect(vaultAsCore.releaseInterest(USDC(40)))
      .to.emit(vault, "InterestReleased")
      .withArgs(USDC(40), USDC(60));
    expect(await vault.reservedInterest()).to.equal(USDC(60));

    await expect(vaultAsCore.releaseInterest(USDC(61))).to.be.revertedWith(
      "Vault: release exceeds reserved",
    );
    await expect(vaultAsCore.reserveInterest(0)).to.be.revertedWith("Vault: zero amount");
    await expect(vaultAsCore.releaseInterest(0)).to.be.revertedWith("Vault: zero amount");
  });

  it("caps admin withdrawals at the unreserved balance", async function () {
    const { admin, depositor, token, vault, core } = await networkHelpers.loadFixture(
      loadBankFixture,
    );
    const { depositId, deposit } = await openDeposit(core, depositor, USDC(1_000));
    const reserved = await vault.reservedInterest();
    const balance = await token.balanceOf(vault.target);

    expect(reserved).to.be.greaterThan(0n);
    await expect(withSigner(vault, admin).withdrawVault(USDC(2_000))).to.be.revertedWith(
      "Vault: reserved interest",
    );

    await withSigner(vault, admin).withdrawVault(balance - reserved);
    expect(await token.balanceOf(vault.target)).to.equal(reserved);
    await expect(withSigner(vault, admin).withdrawVault(1)).to.be.revertedWith(
      "Vault: reserved interest",
    );

    await time.increaseTo(Number(deposit.maturityAt));
    await withSigner(core, depositor).withdrawAtMaturity(depositId);
    expect(await vault.reservedInterest()).to.equal(0n);
    expect(await token.balanceOf(vault.target)).to.equal(0n);

    await withSigner(vault, admin).fundVault(USDC(100));
    await withSigner(vault, admin).withdrawVault(USDC(100));
    expect(await token.balanceOf(vault.target)).to.equal(0n);
  });

  it("rejects a reservation that is not fully backed", async function () {
    const { core, depositor, token, vault } = await networkHelpers.loadFixture(
      loadShortVaultFixture,
    );
    const balance = await token.balanceOf(vault.target);
    expect(balance).to.be.greaterThan(0n);

    await networkHelpers.impersonateAccount(core.target as string);
    await networkHelpers.setBalance(core.target as string, 10n ** 18n);
    const coreSigner = await ethers.getSigner(core.target as string);
    const vaultAsCore = withSigner(vault, coreSigner);

    await expect(vaultAsCore.reserveInterest(balance + 1n)).to.be.revertedWith(
      "Vault: reserve exceeds balance",
    );
    await expect(vaultAsCore.reserveInterest(balance))
      .to.emit(vault, "InterestReserved")
      .withArgs(balance, balance);
    expect(await vault.reservedInterest()).to.equal(balance);

    await expect(vaultAsCore.payInterest(depositor.address, balance))
      .to.emit(vault, "InterestPaid")
      .withArgs(depositor.address, balance);
    expect(await vault.reservedInterest()).to.equal(0n);
    expect(await token.balanceOf(vault.target)).to.equal(0n);
  });

  it("rejects admin withdrawals when the vault has lost its backing", async function () {
    const { admin, depositor, outsider, token, vault, core } = await networkHelpers.loadFixture(
      loadBankFixture,
    );
    await openDeposit(core, depositor, USDC(1_000));

    const vaultAddress = vault.target as string;
    const balance = await token.balanceOf(vaultAddress);
    await networkHelpers.impersonateAccount(vaultAddress);
    await networkHelpers.setBalance(vaultAddress, 10n ** 18n);
    const vaultSigner = await ethers.getSigner(vaultAddress);
    await (token.connect(vaultSigner) as unknown as Contract).transfer(
      outsider.address,
      balance - USDC(1),
    );
    await networkHelpers.stopImpersonatingAccount(vaultAddress);

    expect(await token.balanceOf(vaultAddress)).to.equal(USDC(1));
    expect(await vault.reservedInterest()).to.be.greaterThan(USDC(1));
    await expect(withSigner(vault, admin).withdrawVault(USDC(1))).to.be.revertedWith(
      "Vault: undercollateralized",
    );
  });

  it("releases the reservation on partial and full early exits", async function () {
    const { core, depositor, vault } = await networkHelpers.loadFixture(loadBankFixture);
    const { depositId } = await openDeposit(core, depositor, USDC(1_000));
    expect(await vault.reservedInterest()).to.equal(await core.interestAtMaturity(depositId));

    await withSigner(core, depositor).earlyWithdrawPartial(depositId, USDC(400));
    const afterPartial = await core.interestAtMaturity(depositId);
    expect(await vault.reservedInterest()).to.equal(afterPartial);

    await withSigner(core, depositor).earlyWithdraw(depositId);
    expect(await vault.reservedInterest()).to.equal(0n);
  });
});
