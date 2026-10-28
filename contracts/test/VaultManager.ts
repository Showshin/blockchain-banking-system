import { expect } from "chai";
import { network } from "hardhat";
import { deployBankFixture, USDC, withSigner } from "./fixtures.ts";

const { ethers, networkHelpers } = await network.create();
const loadBankFixture = () => deployBankFixture(ethers);

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

  it("only lets SavingCore pay interest and rejects an overdraw", async function () {
    const { admin, depositor, vault } = await networkHelpers.loadFixture(loadBankFixture);

    await expect(withSigner(vault, admin).payInterest(depositor.address, USDC(1)))
      .to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount")
      .withArgs(admin.address, await vault.CORE_ROLE());
    await expect(withSigner(vault, admin).withdrawVault(USDC(99_999))).to.be.revertedWith(
      "Vault: insufficient balance",
    );

    await withSigner(vault, admin).grantRole(await vault.CORE_ROLE(), admin.address);
    await expect(withSigner(vault, admin).payInterest(ethers.ZeroAddress, USDC(1))).to.be.revertedWith(
      "Vault: zero recipient",
    );
    await expect(withSigner(vault, admin).payInterest(depositor.address, 0)).to.be.revertedWith(
      "Vault: zero amount",
    );
  });
});
