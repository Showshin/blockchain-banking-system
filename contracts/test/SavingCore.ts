import { expect } from "chai";
import { network } from "hardhat";
import {
  DEFAULT_APR_BPS,
  DEFAULT_PENALTY_BPS,
  DEFAULT_TENOR_DAYS,
  GRACE_PERIOD_SECONDS,
} from "../config/personal";
import {
  deployBankFixture as createBankFixture,
  openDeposit,
  USDC,
  withSigner,
} from "./fixtures.ts";

const { ethers, networkHelpers } = await network.create();
const { time } = networkHelpers;
const deployBankFixture = () => createBankFixture(ethers);
const deployShortVaultFixture = () => createBankFixture(ethers, { vaultFunding: USDC(1) });
const loadFixture = networkHelpers.loadFixture;

const ACTIVE = 1n;
const WITHDRAWN = 2n;
const MANUAL_RENEWED = 3n;
const AUTO_RENEWED = 4n;
const PRINCIPAL_WITHDRAWN = 5n;

describe("SavingCore", function () {
  describe("plans", function () {
    it("creates a valid plan and emits the required event", async function () {
      const { core } = await loadFixture(deployBankFixture);
      const planId = await core.nextPlanId();

      await expect(core.createPlan(30, 250, USDC(50), USDC(5_000), 300))
        .to.emit(core, "PlanCreated")
        .withArgs(planId, 30, 250);

      const plan = await core.plans(planId);
      expect(plan.tenorDays).to.equal(30n);
      expect(plan.aprBps).to.equal(250n);
      expect(plan.minDeposit).to.equal(USDC(50));
      expect(plan.maxDeposit).to.equal(USDC(5_000));
      expect(plan.earlyWithdrawPenaltyBps).to.equal(300n);
      expect(plan.enabled).to.equal(true);
    });

    it("rejects invalid APR, tenor and limits", async function () {
      const { core } = await loadFixture(deployBankFixture);

      await expect(core.createPlan(0, 250, 0, 0, 0)).to.be.revertedWith("Core: invalid tenor");
      await expect(core.createPlan(30, 0, 0, 0, 0)).to.be.revertedWith("Core: invalid APR");
      await expect(core.createPlan(30, 10_001, 0, 0, 0)).to.be.revertedWith("Core: invalid APR");
      await expect(core.createPlan(30, 250, 0, 0, 10_001)).to.be.revertedWith(
        "Core: invalid penalty",
      );
      await expect(core.createPlan(30, 250, USDC(100), USDC(50), 0)).to.be.revertedWith(
        "Core: invalid limits",
      );
    });

    it("restricts plan management and supports enable/disable", async function () {
      const { core, outsider } = await loadFixture(deployBankFixture);
      const role = await core.PLAN_MANAGER_ROLE();

      await expect(withSigner(core, outsider).updatePlan(1, 300))
        .to.be.revertedWithCustomError(core, "AccessControlUnauthorizedAccount")
        .withArgs(outsider.address, role);

      await expect(core.setPlanEnabled(1, false))
        .to.emit(core, "PlanStatusChanged")
        .withArgs(1, false);
      await expect(
        withSigner(core, outsider).openDeposit(1, USDC(1_000)),
      ).to.be.revertedWith("Core: plan unavailable");
    });

    it("updates only future APR and keeps an open deposit snapshot unchanged", async function () {
      const { core, depositor } = await loadFixture(deployBankFixture);
      const { depositId } = await openDeposit(core, depositor, USDC(1_000));

      await expect(core.updatePlan(1, 900)).to.emit(core, "PlanUpdated").withArgs(1, 900);
      expect((await core.plans(1)).aprBps).to.equal(900n);
      expect((await core.deposits(depositId)).aprBpsAtOpen).to.equal(BigInt(DEFAULT_APR_BPS));
      await expect(core.updatePlan(1, 10_001)).to.be.revertedWith("Core: invalid APR");
      await expect(core.updatePlan(99, 300)).to.be.revertedWith("Core: unknown plan");
    });
  });

  describe("constructor and token boundaries", function () {
    it("rejects zero dependencies and a zero grace period", async function () {
      const { token, vault } = await loadFixture(deployBankFixture);

      await expect(
        ethers.deployContract("SavingCore", [ethers.ZeroAddress, vault.target, 1]),
      ).to.be.revertedWith("Core: zero asset");
      await expect(
        ethers.deployContract("SavingCore", [token.target, ethers.ZeroAddress, 1]),
      ).to.be.revertedWith("Core: zero vault");
      await expect(
        ethers.deployContract("SavingCore", [token.target, vault.target, 0]),
      ).to.be.revertedWith("Core: zero grace period");
    });

    it("requires ERC-20 allowance before a certificate can be minted", async function () {
      const { core, token, admin } = await loadFixture(deployBankFixture);
      const nextDepositId = await core.nextDepositId();

      await expect(withSigner(core, admin).openDeposit(1, USDC(1_000)))
        .to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
      expect(await core.nextDepositId()).to.equal(nextDepositId);
      await expect(core.ownerOf(nextDepositId)).to.revert(ethers);
    });
  });

  describe("opening deposits", function () {
    it("holds principal, mints the certificate and snapshots the plan", async function () {
      const { core, token, depositor } = await loadFixture(deployBankFixture);
      const amount = USDC(1_000);
      const coreBalanceBefore = await token.balanceOf(core.target);
      const openedAt = BigInt(await time.latest());

      const { depositId, deposit } = await openDeposit(core, depositor, amount);

      expect(await core.ownerOf(depositId)).to.equal(depositor.address);
      expect(await token.balanceOf(core.target)).to.equal(coreBalanceBefore + amount);
      expect(deposit.planId).to.equal(1n);
      expect(deposit.principal).to.equal(amount);
      expect(deposit.aprBpsAtOpen).to.equal(BigInt(DEFAULT_APR_BPS));
      expect(deposit.penaltyBpsAtOpen).to.equal(BigInt(DEFAULT_PENALTY_BPS));
      expect(deposit.tenorDays).to.equal(BigInt(DEFAULT_TENOR_DAYS));
      expect(deposit.maturityAt).to.equal(deposit.openedAt + BigInt(DEFAULT_TENOR_DAYS) * 86_400n);
      expect(deposit.openedAt).to.be.greaterThanOrEqual(openedAt);
      expect(deposit.status).to.equal(ACTIVE);
    });

    it("emits DepositOpened with the stored snapshot", async function () {
      const { core, depositor } = await loadFixture(deployBankFixture);
      const planId = 1n;
      const amount = USDC(900);
      const nextId = await core.nextDepositId();
      const tx = await withSigner(core, depositor).openDeposit(planId, amount);
      const deposit = await core.deposits(nextId);

      await expect(tx)
        .to.emit(core, "DepositOpened")
        .withArgs(
          nextId,
          depositor.address,
          planId,
          amount,
          deposit.maturityAt,
          DEFAULT_APR_BPS,
        );
    });

    it("enforces min, max, disabled plans and unknown plans", async function () {
      const { core, depositor } = await loadFixture(deployBankFixture);

      await expect(withSigner(core, depositor).openDeposit(1, USDC(99))).to.be.revertedWith(
        "Core: below minimum",
      );
      await expect(withSigner(core, depositor).openDeposit(1, USDC(100_001))).to.be.revertedWith(
        "Core: above maximum",
      );
      await expect(withSigner(core, depositor).openDeposit(99, USDC(1_000))).to.be.revertedWith(
        "Core: plan unavailable",
      );
      await expect(withSigner(core, depositor).openDeposit(1, 0)).to.be.revertedWith(
        "Core: invalid amount",
      );
    });
  });

  describe("withdrawals", function () {
    it("exposes the snapshotted penalty and both ERC-721 interfaces", async function () {
      const { core, depositor } = await loadFixture(deployBankFixture);
      const { depositId } = await openDeposit(core, depositor, USDC(1_000));

      expect(await core.earlyWithdrawalPenalty(depositId)).to.equal(USDC(40));
      expect(await core.supportsInterface("0x80ac58cd")).to.equal(true);
      expect(await core.supportsInterface("0x7965db0b")).to.equal(true);
      expect(await core.supportsInterface("0xffffffff")).to.equal(false);
      await expect(core.earlyWithdrawalPenalty(999)).to.be.revertedWith("Core: unknown deposit");
      await expect(core.interestAtMaturity(999)).to.be.revertedWith("Core: unknown deposit");
    });

    it("pays simple interest from the vault at exact maturity", async function () {
      const { core, token, vault, depositor, admin } = await loadFixture(deployBankFixture);
      const principal = USDC(1_000);
      const { depositId, deposit } = await openDeposit(core, depositor, principal);
      const interest = await core.interestAtMaturity(depositId);
      const expectedInterest = 5_547_945n;
      expect(interest).to.equal(expectedInterest);

      await time.increaseTo(Number(deposit.maturityAt));
      const userBefore = await token.balanceOf(depositor.address);
      const vaultBefore = await token.balanceOf(vault.target);

      await expect(withSigner(core, depositor).withdrawAtMaturity(depositId))
        .to.emit(core, "Withdrawn")
        .withArgs(depositId, depositor.address, principal, interest, false)
        .and.to.emit(vault, "InterestPaid")
        .withArgs(depositor.address, interest);

      expect(await token.balanceOf(depositor.address)).to.equal(userBefore + principal + interest);
      expect(await token.balanceOf(vault.target)).to.equal(vaultBefore - interest);
      expect((await core.deposits(depositId)).status).to.equal(WITHDRAWN);
      expect(await token.balanceOf(admin.address)).to.be.greaterThan(0n);
    });

    it("rejects an early maturity withdrawal and a double withdrawal", async function () {
      const { core, depositor } = await loadFixture(deployBankFixture);
      const { depositId, deposit } = await openDeposit(core, depositor, USDC(1_000));

      await expect(withSigner(core, depositor).withdrawAtMaturity(depositId)).to.be.revertedWith(
        "Core: not matured",
      );
      await time.increaseTo(Number(deposit.maturityAt));
      await withSigner(core, depositor).withdrawAtMaturity(depositId);
      await expect(withSigner(core, depositor).withdrawAtMaturity(depositId)).to.be.revertedWith(
        "Core: deposit inactive",
      );
    });

    it("deducts the snapshotted penalty and sends it to the fee receiver", async function () {
      const { core, token, vault, depositor, feeAccount } = await loadFixture(deployBankFixture);
      const principal = USDC(1_000);
      const { depositId } = await openDeposit(core, depositor, principal);
      const penalty = (principal * BigInt(DEFAULT_PENALTY_BPS)) / 10_000n;
      expect(penalty).to.equal(USDC(40));

      await time.increase(10 * 86_400);
      const userBefore = await token.balanceOf(depositor.address);
      const feeBefore = await token.balanceOf(feeAccount.address);
      const vaultBefore = await token.balanceOf(vault.target);

      await expect(withSigner(core, depositor).earlyWithdraw(depositId))
        .to.emit(core, "Withdrawn")
        .withArgs(depositId, depositor.address, principal, 0, true);

      expect(await token.balanceOf(depositor.address)).to.equal(userBefore + principal - penalty);
      expect(await token.balanceOf(feeAccount.address)).to.equal(feeBefore + penalty);
      expect(await token.balanceOf(vault.target)).to.equal(vaultBefore);
      expect((await core.deposits(depositId)).status).to.equal(WITHDRAWN);
    });

    it("does not allow early withdrawal after maturity", async function () {
      const { core, depositor } = await loadFixture(deployBankFixture);
      const { depositId, deposit } = await openDeposit(core, depositor, USDC(1_000));
      await time.increaseTo(Number(deposit.maturityAt));

      await expect(withSigner(core, depositor).earlyWithdraw(depositId)).to.be.revertedWith(
        "Core: already matured",
      );
    });

    describe("partial early withdrawals", function () {
      it("withdraws part early, charges penalty on that part and keeps the rest active", async function () {
        const { core, token, vault, depositor, feeAccount } = await loadFixture(deployBankFixture);
        const principal = USDC(1_000);
        const amount = USDC(200);
        const penalty = USDC(8);
        const { depositId, deposit } = await openDeposit(core, depositor, principal);

        await time.increase(10 * 86_400);
        const userBefore = await token.balanceOf(depositor.address);
        const feeBefore = await token.balanceOf(feeAccount.address);
        const vaultBefore = await token.balanceOf(vault.target);

        await expect(withSigner(core, depositor).earlyWithdrawPartial(depositId, amount))
          .to.emit(core, "PartialEarlyWithdrawn")
          .withArgs(depositId, depositor.address, amount, penalty, principal - amount);

        const after = await core.deposits(depositId);
        expect(after.principal).to.equal(principal - amount);
        expect(after.status).to.equal(ACTIVE);
        expect(after.aprBpsAtOpen).to.equal(BigInt(DEFAULT_APR_BPS));
        expect(after.penaltyBpsAtOpen).to.equal(BigInt(DEFAULT_PENALTY_BPS));
        expect(after.tenorDays).to.equal(BigInt(DEFAULT_TENOR_DAYS));
        expect(after.maturityAt).to.equal(deposit.maturityAt);
        expect(await core.ownerOf(depositId)).to.equal(depositor.address);
        expect(await token.balanceOf(depositor.address)).to.equal(userBefore + amount - penalty);
        expect(await token.balanceOf(feeAccount.address)).to.equal(feeBefore + penalty);
        expect(await token.balanceOf(vault.target)).to.equal(vaultBefore);
      });

      it("pays maturity interest only on the remaining principal", async function () {
        const { core, token, vault, depositor } = await loadFixture(deployBankFixture);
        const principal = USDC(1_000);
        const amount = USDC(200);
        const remaining = principal - amount;
        const { depositId, deposit } = await openDeposit(core, depositor, principal);

        await withSigner(core, depositor).earlyWithdrawPartial(depositId, amount);
        const expectedInterest =
          (remaining * BigInt(DEFAULT_APR_BPS) * BigInt(DEFAULT_TENOR_DAYS)) / (365n * 10_000n);
        expect(await core.interestAtMaturity(depositId)).to.equal(expectedInterest);

        await time.increaseTo(Number(deposit.maturityAt));
        const userBefore = await token.balanceOf(depositor.address);
        const vaultBefore = await token.balanceOf(vault.target);

        await expect(withSigner(core, depositor).withdrawAtMaturity(depositId))
          .to.emit(core, "Withdrawn")
          .withArgs(depositId, depositor.address, remaining, expectedInterest, false);

        expect(await token.balanceOf(depositor.address)).to.equal(
          userBefore + remaining + expectedInterest,
        );
        expect(await token.balanceOf(vault.target)).to.equal(vaultBefore - expectedInterest);
        expect((await core.deposits(depositId)).status).to.equal(WITHDRAWN);
      });

      it("rejects a partial withdrawal that leaves less than the plan minimum", async function () {
        const { core, depositor } = await loadFixture(deployBankFixture);
        const planId = await core.nextPlanId();
        await core.createPlan(90, 225, USDC(500), USDC(100_000), 400);
        const { depositId } = await openDeposit(core, depositor, USDC(500), planId);

        await expect(
          withSigner(core, depositor).earlyWithdrawPartial(depositId, USDC(100)),
        ).to.be.revertedWith("Core: remaining below minimum");
        expect((await core.deposits(depositId)).principal).to.equal(USDC(500));

        await withSigner(core, depositor).earlyWithdraw(depositId);
        expect((await core.deposits(depositId)).status).to.equal(WITHDRAWN);
      });

      it("allows a partial withdrawal that leaves exactly the plan minimum", async function () {
        const { core, depositor } = await loadFixture(deployBankFixture);
        const planId = await core.nextPlanId();
        await core.createPlan(90, 225, USDC(500), USDC(100_000), 400);
        const { depositId } = await openDeposit(core, depositor, USDC(1_000), planId);

        await expect(withSigner(core, depositor).earlyWithdrawPartial(depositId, USDC(500)))
          .to.emit(core, "PartialEarlyWithdrawn")
          .withArgs(depositId, depositor.address, USDC(500), USDC(20), USDC(500));

        expect((await core.deposits(depositId)).principal).to.equal(USDC(500));
        expect((await core.deposits(depositId)).status).to.equal(ACTIVE);
      });

      it("rejects zero, full, over-principal and post-maturity partial withdrawals", async function () {
        const { core, depositor } = await loadFixture(deployBankFixture);
        const { depositId, deposit } = await openDeposit(core, depositor, USDC(1_000));

        await expect(
          withSigner(core, depositor).earlyWithdrawPartial(depositId, 0),
        ).to.be.revertedWith("Core: invalid partial amount");
        await expect(
          withSigner(core, depositor).earlyWithdrawPartial(depositId, USDC(1_000)),
        ).to.be.revertedWith("Core: invalid partial amount");
        await expect(
          withSigner(core, depositor).earlyWithdrawPartial(depositId, USDC(1_001)),
        ).to.be.revertedWith("Core: invalid partial amount");

        await time.increaseTo(Number(deposit.maturityAt));
        await expect(
          withSigner(core, depositor).earlyWithdrawPartial(depositId, USDC(100)),
        ).to.be.revertedWith("Core: already matured");
      });

      it("keeps partial withdrawal owner-only and active-only", async function () {
        const { core, depositor, outsider } = await loadFixture(deployBankFixture);
        const { depositId } = await openDeposit(core, depositor, USDC(1_000));

        await expect(
          withSigner(core, outsider).earlyWithdrawPartial(depositId, USDC(100)),
        ).to.be.revertedWith("Core: not certificate owner");

        await withSigner(core, depositor).earlyWithdraw(depositId);
        await expect(
          withSigner(core, depositor).earlyWithdrawPartial(depositId, USDC(100)),
        ).to.be.revertedWith("Core: deposit inactive");
      });

      it("lets the current NFT owner partially withdraw after a transfer", async function () {
        const { core, depositor, recipient } = await loadFixture(deployBankFixture);
        const { depositId } = await openDeposit(core, depositor, USDC(1_000));
        await withSigner(core, depositor).transferFrom(
          depositor.address,
          recipient.address,
          depositId,
        );

        await expect(
          withSigner(core, depositor).earlyWithdrawPartial(depositId, USDC(100)),
        ).to.be.revertedWith("Core: not certificate owner");
        await withSigner(core, recipient).earlyWithdrawPartial(depositId, USDC(100));

        expect((await core.deposits(depositId)).principal).to.equal(USDC(900));
        expect(await core.ownerOf(depositId)).to.equal(recipient.address);
      });

      it("blocks partial early withdrawal while paused", async function () {
        const { core, vault, admin, depositor } = await loadFixture(deployBankFixture);
        const { depositId } = await openDeposit(core, depositor, USDC(1_000));
        await withSigner(vault, admin).pause();

        await expect(
          withSigner(core, depositor).earlyWithdrawPartial(depositId, USDC(100)),
        ).to.be.revertedWith("Core: system paused");

        await withSigner(vault, admin).unpause();
        await withSigner(core, depositor).earlyWithdrawPartial(depositId, USDC(100));
        expect((await core.deposits(depositId)).principal).to.equal(USDC(900));
      });

      it("returns the full withdrawn part when the plan penalty is zero", async function () {
        const { core, token, depositor, feeAccount } = await loadFixture(deployBankFixture);
        const planId = await core.nextPlanId();
        await core.createPlan(30, 100, 0, 0, 0);
        const { depositId } = await openDeposit(core, depositor, USDC(1_000), planId);
        const userBefore = await token.balanceOf(depositor.address);
        const feeBefore = await token.balanceOf(feeAccount.address);

        await expect(withSigner(core, depositor).earlyWithdrawPartial(depositId, USDC(400)))
          .to.emit(core, "PartialEarlyWithdrawn")
          .withArgs(depositId, depositor.address, USDC(400), 0n, USDC(600));

        expect(await token.balanceOf(depositor.address)).to.equal(userBefore + USDC(400));
        expect(await token.balanceOf(feeAccount.address)).to.equal(feeBefore);
      });

      it("sends the whole withdrawn part to the fee receiver at 100% penalty", async function () {
        const { core, token, depositor, feeAccount } = await loadFixture(deployBankFixture);
        const planId = await core.nextPlanId();
        await core.createPlan(30, 100, 0, 0, 10_000);
        const { depositId } = await openDeposit(core, depositor, USDC(1_000), planId);
        const userBefore = await token.balanceOf(depositor.address);
        const feeBefore = await token.balanceOf(feeAccount.address);

        await expect(withSigner(core, depositor).earlyWithdrawPartial(depositId, USDC(400)))
          .to.emit(core, "PartialEarlyWithdrawn")
          .withArgs(depositId, depositor.address, USDC(400), USDC(400), USDC(600));

        expect(await token.balanceOf(depositor.address)).to.equal(userBefore);
        expect(await token.balanceOf(feeAccount.address)).to.equal(feeBefore + USDC(400));
        expect((await core.deposits(depositId)).principal).to.equal(USDC(600));
      });

      it("charges a later full early withdrawal on the remaining principal", async function () {
        const { core, token, depositor, feeAccount } = await loadFixture(deployBankFixture);
        const principal = USDC(1_000);
        const partial = USDC(200);
        const { depositId } = await openDeposit(core, depositor, principal);
        const userBefore = await token.balanceOf(depositor.address);
        const feeBefore = await token.balanceOf(feeAccount.address);

        await withSigner(core, depositor).earlyWithdrawPartial(depositId, partial);
        await expect(withSigner(core, depositor).earlyWithdraw(depositId))
          .to.emit(core, "Withdrawn")
          .withArgs(depositId, depositor.address, principal - partial, 0, true);

        expect(await token.balanceOf(depositor.address)).to.equal(userBefore + USDC(960));
        expect(await token.balanceOf(feeAccount.address)).to.equal(feeBefore + USDC(40));
        expect((await core.deposits(depositId)).status).to.equal(WITHDRAWN);
      });
    });

    it("allows a zero-penalty plan to return the full principal early", async function () {
      const { core, token, depositor, feeAccount } = await loadFixture(deployBankFixture);
      const planId = await core.nextPlanId();
      await core.createPlan(30, 100, 0, 0, 0);
      const amount = USDC(1_000);
      const { depositId } = await openDeposit(core, depositor, amount, planId);
      const userBefore = await token.balanceOf(depositor.address);
      const feeBefore = await token.balanceOf(feeAccount.address);

      expect(await core.earlyWithdrawalPenalty(depositId)).to.equal(0n);
      await withSigner(core, depositor).earlyWithdraw(depositId);

      expect(await token.balanceOf(depositor.address)).to.equal(userBefore + amount);
      expect(await token.balanceOf(feeAccount.address)).to.equal(feeBefore);
    });

    it("routes a new early penalty to the current fee receiver", async function () {
      const { core, token, vault, admin, depositor, feeAccount, recipient } =
        await loadFixture(deployBankFixture);
      const principal = USDC(1_000);
      const penalty = USDC(40);
      const { depositId } = await openDeposit(core, depositor, principal);
      const oldReceiverBefore = await token.balanceOf(feeAccount.address);
      const newReceiverBefore = await token.balanceOf(recipient.address);

      await withSigner(vault, admin).setFeeReceiver(recipient.address);
      await withSigner(core, depositor).earlyWithdraw(depositId);

      expect(await token.balanceOf(feeAccount.address)).to.equal(oldReceiverBefore);
      expect(await token.balanceOf(recipient.address)).to.equal(newReceiverBefore + penalty);
    });

    it("gives actions to the current NFT owner after a transfer", async function () {
      const { core, token, depositor, recipient } = await loadFixture(deployBankFixture);
      const principal = USDC(1_000);
      const { depositId, deposit } = await openDeposit(core, depositor, principal);
      await withSigner(core, depositor).transferFrom(
        depositor.address,
        recipient.address,
        depositId,
      );
      await time.increaseTo(Number(deposit.maturityAt));

      await expect(withSigner(core, depositor).withdrawAtMaturity(depositId)).to.be.revertedWith(
        "Core: not certificate owner",
      );
      const recipientBefore = await token.balanceOf(recipient.address);
      await withSigner(core, recipient).withdrawAtMaturity(depositId);
      expect(await core.ownerOf(depositId)).to.equal(recipient.address);
      expect(await token.balanceOf(recipient.address)).to.be.greaterThan(recipientBefore);
    });

    it("pays principal and defers interest when the vault cannot pay", async function () {
      const { core, token, vault, depositor } = await loadFixture(deployShortVaultFixture);
      const principal = USDC(1_000);
      const { depositId, deposit } = await openDeposit(core, depositor, principal);
      const interest = await core.interestAtMaturity(depositId);
      await time.increaseTo(Number(deposit.maturityAt));
      const userBefore = await token.balanceOf(depositor.address);

      const tx = withSigner(core, depositor).withdrawAtMaturity(depositId);
      await expect(tx)
        .to.emit(core, "Withdrawn")
        .withArgs(depositId, depositor.address, principal, interest, false);
      await expect(tx)
        .to.emit(core, "InterestDeferred")
        .withArgs(depositId, depositor.address, interest);

      expect(await token.balanceOf(depositor.address)).to.equal(userBefore + principal);
      expect((await core.deposits(depositId)).status).to.equal(PRINCIPAL_WITHDRAWN);
      expect(await core.pendingInterest(depositId)).to.equal(interest);
      expect(await vault.reservedInterest()).to.equal(interest);
    });

    it("lets the owner claim deferred interest once the vault is funded", async function () {
      const { core, token, vault, admin, depositor } = await loadFixture(deployShortVaultFixture);
      const { depositId, deposit } = await openDeposit(core, depositor, USDC(1_000));
      const interest = await core.interestAtMaturity(depositId);

      await expect(withSigner(core, depositor).claimInterest(depositId)).to.be.revertedWith(
        "Core: no pending interest",
      );
      await time.increaseTo(Number(deposit.maturityAt));
      await withSigner(core, depositor).withdrawAtMaturity(depositId);
      await withSigner(vault, admin).fundVault(USDC(100));

      const userBefore = await token.balanceOf(depositor.address);
      const reservedBefore = await vault.reservedInterest();
      await expect(withSigner(core, depositor).claimInterest(depositId))
        .to.emit(core, "InterestClaimed")
        .withArgs(depositId, depositor.address, interest);

      expect(await token.balanceOf(depositor.address)).to.equal(userBefore + interest);
      expect(await core.pendingInterest(depositId)).to.equal(0n);
      expect(await vault.reservedInterest()).to.equal(reservedBefore - interest);
      expect((await core.deposits(depositId)).status).to.equal(PRINCIPAL_WITHDRAWN);
      await expect(withSigner(core, depositor).claimInterest(depositId)).to.be.revertedWith(
        "Core: no pending interest",
      );
    });

    it("moves the deferred interest claim with the certificate", async function () {
      const { core, vault, admin, depositor, recipient } = await loadFixture(
        deployShortVaultFixture,
      );
      const { depositId, deposit } = await openDeposit(core, depositor, USDC(1_000));
      const interest = await core.interestAtMaturity(depositId);
      await time.increaseTo(Number(deposit.maturityAt));
      await withSigner(core, depositor).withdrawAtMaturity(depositId);
      await withSigner(core, depositor).transferFrom(
        depositor.address,
        recipient.address,
        depositId,
      );
      await withSigner(vault, admin).fundVault(USDC(100));

      await expect(withSigner(core, depositor).claimInterest(depositId)).to.be.revertedWith(
        "Core: not certificate owner",
      );
      await expect(withSigner(core, recipient).claimInterest(depositId))
        .to.emit(core, "InterestClaimed")
        .withArgs(depositId, recipient.address, interest);
    });

    it("blocks claiming deferred interest while paused", async function () {
      const { core, vault, admin, depositor } = await loadFixture(deployShortVaultFixture);
      const { depositId, deposit } = await openDeposit(core, depositor, USDC(1_000));
      await time.increaseTo(Number(deposit.maturityAt));
      await withSigner(core, depositor).withdrawAtMaturity(depositId);
      await withSigner(vault, admin).fundVault(USDC(100));
      await withSigner(vault, admin).pause();

      await expect(withSigner(core, depositor).claimInterest(depositId)).to.be.revertedWith(
        "Core: system paused",
      );
      await withSigner(vault, admin).unpause();
      await withSigner(core, depositor).claimInterest(depositId);
      expect(await core.pendingInterest(depositId)).to.equal(0n);
    });

    it("keeps a deferred-interest certificate inactive for maturity exit", async function () {
      const { core, vault, admin, depositor } = await loadFixture(deployShortVaultFixture);
      const { depositId, deposit } = await openDeposit(core, depositor, USDC(1_000));
      await time.increaseTo(Number(deposit.maturityAt));
      await withSigner(core, depositor).withdrawAtMaturity(depositId);

      await expect(withSigner(core, depositor).withdrawAtMaturity(depositId)).to.be.revertedWith(
        "Core: deposit inactive",
      );
      await withSigner(vault, admin).fundVault(USDC(100));
      await withSigner(core, depositor).claimInterest(depositId);
    });
  });

  describe("top-ups", function () {
    it("adds principal with weighted interest and keeps the locked terms", async function () {
      const { core, token, vault, depositor } = await loadFixture(deployBankFixture);
      const principal = USDC(1_000);
      const topUp = USDC(500);
      const { depositId, deposit } = await openDeposit(core, depositor, principal);
      const beforeInterest = await core.interestAtMaturity(depositId);
      const reservedBefore = await vault.reservedInterest();
      const userBefore = await token.balanceOf(depositor.address);
      const coreBefore = await token.balanceOf(core.target);

      const at = Number(deposit.openedAt) + 30 * 86_400;
      await time.setNextBlockTimestamp(at);
      const remainingSeconds = BigInt(Number(deposit.maturityAt) - at);
      const weightedSeconds =
        principal * BigInt(DEFAULT_TENOR_DAYS) * 86_400n + topUp * remainingSeconds;
      const afterInterest =
        (weightedSeconds * BigInt(DEFAULT_APR_BPS)) / (365n * 86_400n * 10_000n);
      const expectedAdded = afterInterest - beforeInterest;

      await expect(withSigner(core, depositor).topUpDeposit(depositId, topUp))
        .to.emit(core, "DepositToppedUp")
        .withArgs(depositId, depositor.address, topUp, principal + topUp, expectedAdded);

      const after = await core.deposits(depositId);
      expect(after.principal).to.equal(principal + topUp);
      expect(after.principalSeconds).to.equal(weightedSeconds);
      expect(after.maturityAt).to.equal(deposit.maturityAt);
      expect(after.aprBpsAtOpen).to.equal(BigInt(DEFAULT_APR_BPS));
      expect(after.penaltyBpsAtOpen).to.equal(BigInt(DEFAULT_PENALTY_BPS));
      expect(after.tenorDays).to.equal(BigInt(DEFAULT_TENOR_DAYS));
      expect(await core.interestAtMaturity(depositId)).to.equal(afterInterest);
      expect(await vault.reservedInterest()).to.equal(reservedBefore + expectedAdded);
      expect(await token.balanceOf(depositor.address)).to.equal(userBefore - topUp);
      expect(await token.balanceOf(core.target)).to.equal(coreBefore + topUp);
    });

    it("enforces ownership, amount, plan maximum, pause and maturity on top-ups", async function () {
      const { core, vault, admin, depositor, outsider } = await loadFixture(deployBankFixture);
      const { depositId, deposit } = await openDeposit(core, depositor, USDC(1_000));

      await expect(
        withSigner(core, outsider).topUpDeposit(depositId, USDC(100)),
      ).to.be.revertedWith("Core: not certificate owner");
      await expect(withSigner(core, depositor).topUpDeposit(depositId, 0)).to.be.revertedWith(
        "Core: invalid amount",
      );
      await expect(
        withSigner(core, depositor).topUpDeposit(depositId, USDC(99_500)),
      ).to.be.revertedWith("Core: above maximum");

      await withSigner(vault, admin).pause();
      await expect(
        withSigner(core, depositor).topUpDeposit(depositId, USDC(100)),
      ).to.be.revertedWith("Core: system paused");
      await withSigner(vault, admin).unpause();

      await time.increaseTo(Number(deposit.maturityAt));
      await expect(
        withSigner(core, depositor).topUpDeposit(depositId, USDC(100)),
      ).to.be.revertedWith("Core: already matured");
    });

    it("reduces weighted principal pro-rata after a partial early withdrawal", async function () {
      const { core, token, vault, depositor, feeAccount } = await loadFixture(deployBankFixture);
      const principal = USDC(1_000);
      const topUp = USDC(1_000);
      const { depositId, deposit } = await openDeposit(core, depositor, principal);

      const at = Number(deposit.openedAt) + 30 * 86_400;
      await time.setNextBlockTimestamp(at);
      await withSigner(core, depositor).topUpDeposit(depositId, topUp);
      const topped = await core.deposits(depositId);
      const beforeInterest = await core.interestAtMaturity(depositId);
      const reservedBefore = await vault.reservedInterest();

      const amount = USDC(500);
      const penalty = USDC(20);
      const remainingPrincipal = principal + topUp - amount;
      const userBefore = await token.balanceOf(depositor.address);
      const feeBefore = await token.balanceOf(feeAccount.address);
      await time.setNextBlockTimestamp(at + 86_400);

      await expect(withSigner(core, depositor).earlyWithdrawPartial(depositId, amount))
        .to.emit(core, "PartialEarlyWithdrawn")
        .withArgs(depositId, depositor.address, amount, penalty, remainingPrincipal);

      const after = await core.deposits(depositId);
      const expectedSeconds = (topped.principalSeconds * remainingPrincipal) / (principal + topUp);
      const afterInterest =
        (expectedSeconds * BigInt(DEFAULT_APR_BPS)) / (365n * 86_400n * 10_000n);
      expect(after.principal).to.equal(remainingPrincipal);
      expect(after.principalSeconds).to.equal(expectedSeconds);
      expect(await core.interestAtMaturity(depositId)).to.equal(afterInterest);
      expect(await vault.reservedInterest()).to.equal(
        reservedBefore - (beforeInterest - afterInterest),
      );
      expect(await token.balanceOf(depositor.address)).to.equal(userBefore + amount - penalty);
      expect(await token.balanceOf(feeAccount.address)).to.equal(feeBefore + penalty);
    });

    it("renews a topped-up deposit with its weighted interest", async function () {
      const { core, depositor } = await loadFixture(deployBankFixture);
      const { depositId, deposit } = await openDeposit(core, depositor, USDC(1_000));
      await time.setNextBlockTimestamp(Number(deposit.openedAt) + 30 * 86_400);
      await withSigner(core, depositor).topUpDeposit(depositId, USDC(500));

      const interest = await core.interestAtMaturity(depositId);
      const newPrincipal = USDC(1_500) + interest;
      await time.increaseTo(Number(deposit.maturityAt));
      const newDepositId = await core.nextDepositId();

      await expect(withSigner(core, depositor).renewDeposit(depositId, 2))
        .to.emit(core, "Renewed")
        .withArgs(depositId, newDepositId, newPrincipal, 2);
      expect((await core.deposits(newDepositId)).principal).to.equal(newPrincipal);
    });
  });

  describe("renewals", function () {
    it("manually renews into an enabled plan with compounded interest", async function () {
      const { core, token, vault, depositor } = await loadFixture(deployBankFixture);
      const principal = USDC(1_000);
      const { depositId, deposit } = await openDeposit(core, depositor, principal);
      const interest = await core.interestAtMaturity(depositId);
      const newPrincipal = principal + interest;
      const vaultBefore = await token.balanceOf(vault.target);
      const newDepositId = await core.nextDepositId();
      await time.increaseTo(Number(deposit.maturityAt));

      await expect(withSigner(core, depositor).renewDeposit(depositId, 2))
        .to.emit(core, "Renewed")
        .withArgs(depositId, newDepositId, newPrincipal, 2);

      const oldDeposit = await core.deposits(depositId);
      const renewedDeposit = await core.deposits(newDepositId);
      expect(oldDeposit.status).to.equal(MANUAL_RENEWED);
      expect(renewedDeposit.principal).to.equal(newPrincipal);
      expect(renewedDeposit.aprBpsAtOpen).to.equal(300n);
      expect(renewedDeposit.tenorDays).to.equal(180n);
      expect(await core.ownerOf(newDepositId)).to.equal(depositor.address);
      expect(await token.balanceOf(vault.target)).to.equal(vaultBefore - interest);
    });

    it("rejects manual renewal before maturity or into a disabled plan", async function () {
      const { core, depositor } = await loadFixture(deployBankFixture);
      const { depositId, deposit } = await openDeposit(core, depositor, USDC(1_000));

      await expect(withSigner(core, depositor).renewDeposit(depositId, 2)).to.be.revertedWith(
        "Core: not matured",
      );
      await time.increaseTo(Number(deposit.maturityAt));
      await core.setPlanEnabled(2, false);
      await expect(withSigner(core, depositor).renewDeposit(depositId, 2)).to.be.revertedWith(
        "Core: plan unavailable",
      );
    });

    it("keeps manual renewal available after grace if the bot has not acted", async function () {
      const { core, depositor } = await loadFixture(deployBankFixture);
      const { depositId, deposit } = await openDeposit(core, depositor, USDC(1_000));
      await time.increaseTo(Number(deposit.maturityAt + GRACE_PERIOD_SECONDS + 86_400n));

      await withSigner(core, depositor).renewDeposit(depositId, 1);
      expect((await core.deposits(depositId)).status).to.equal(MANUAL_RENEWED);
    });

    it("blocks auto-renew before grace and uses the original APR after grace", async function () {
      const { core, depositor, outsider } = await loadFixture(deployBankFixture);
      const principal = USDC(1_000);
      const { depositId, deposit } = await openDeposit(core, depositor, principal);
      const graceEnd = deposit.maturityAt + GRACE_PERIOD_SECONDS;

      // Hardhat mines the next transaction one second after increaseTo().
      await time.increaseTo(Number(graceEnd - 2n));
      await expect(core.autoRenewDeposit(depositId)).to.be.revertedWith(
        "Core: grace period not elapsed",
      );

      await core.updatePlan(1, 900);
      const newDepositId = await core.nextDepositId();
      const interest = await core.interestAtMaturity(depositId);
      await expect(withSigner(core, outsider).autoRenewDeposit(depositId))
        .to.emit(core, "Renewed")
        .withArgs(depositId, newDepositId, principal + interest, 1);

      const renewed = await core.deposits(newDepositId);
      expect((await core.deposits(depositId)).status).to.equal(AUTO_RENEWED);
      expect(renewed.aprBpsAtOpen).to.equal(BigInt(DEFAULT_APR_BPS));
      expect(renewed.penaltyBpsAtOpen).to.equal(BigInt(DEFAULT_PENALTY_BPS));
      expect(renewed.tenorDays).to.equal(BigInt(DEFAULT_TENOR_DAYS));
      expect(await core.ownerOf(newDepositId)).to.equal(depositor.address);
      await expect(core.autoRenewDeposit(depositId)).to.be.revertedWith("Core: deposit inactive");
    });

    it("keeps both renewal paths active and un-minted when the vault is short", async function () {
      const { core, depositor } = await loadFixture(deployShortVaultFixture);
      const manual = await openDeposit(core, depositor, USDC(1_000));
      const automatic = await openDeposit(core, depositor, USDC(1_000));
      await time.increaseTo(Number(automatic.deposit.maturityAt + GRACE_PERIOD_SECONDS));
      const nextDepositId = await core.nextDepositId();

      await expect(withSigner(core, depositor).renewDeposit(manual.depositId, 2)).to.be.revertedWith(
        "Vault: insufficient interest",
      );
      await expect(core.autoRenewDeposit(automatic.depositId)).to.be.revertedWith(
        "Vault: insufficient interest",
      );

      expect((await core.deposits(manual.depositId)).status).to.equal(ACTIVE);
      expect((await core.deposits(automatic.depositId)).status).to.equal(ACTIVE);
      expect(await core.nextDepositId()).to.equal(nextDepositId);
    });

    it("auto-renews the certificate to its current NFT owner", async function () {
      const { core, depositor, recipient, outsider } = await loadFixture(deployBankFixture);
      const { depositId, deposit } = await openDeposit(core, depositor, USDC(1_000));
      await withSigner(core, depositor).transferFrom(depositor.address, recipient.address, depositId);
      await time.increaseTo(Number(deposit.maturityAt + GRACE_PERIOD_SECONDS));
      const newDepositId = await core.nextDepositId();

      await withSigner(core, outsider).autoRenewDeposit(depositId);

      expect(await core.ownerOf(newDepositId)).to.equal(recipient.address);
      expect((await core.deposits(depositId)).status).to.equal(AUTO_RENEWED);
    });

    it("allows auto-renew at the exact end of the grace period", async function () {
      const { core, depositor } = await loadFixture(deployBankFixture);
      const { depositId, deposit } = await openDeposit(core, depositor, USDC(1_000));
      await time.setNextBlockTimestamp(deposit.maturityAt + GRACE_PERIOD_SECONDS);

      await expect(core.autoRenewDeposit(depositId)).to.emit(core, "Renewed");
    });
  });

  describe("pause and precision", function () {
    it("blocks new deposits and all exits while the vault is paused", async function () {
      const { core, vault, admin, depositor } = await loadFixture(deployBankFixture);
      const { depositId } = await openDeposit(core, depositor, USDC(1_000));
      await withSigner(vault, admin).pause();

      await expect(withSigner(core, depositor).openDeposit(1, USDC(1_000))).to.be.revertedWith(
        "Core: system paused",
      );
      await expect(withSigner(core, depositor).earlyWithdraw(depositId)).to.be.revertedWith(
        "Core: system paused",
      );
      await withSigner(vault, admin).unpause();
      await withSigner(core, depositor).earlyWithdraw(depositId);
    });

    it("blocks maturity withdrawal, manual renewal and auto-renew while paused", async function () {
      const { core, vault, admin, depositor } = await loadFixture(deployBankFixture);
      const manual = await openDeposit(core, depositor, USDC(1_000));
      const automatic = await openDeposit(core, depositor, USDC(1_000));
      await withSigner(vault, admin).pause();
      await time.increaseTo(Number(automatic.deposit.maturityAt + GRACE_PERIOD_SECONDS));
      const nextDepositId = await core.nextDepositId();

      await expect(withSigner(core, depositor).withdrawAtMaturity(manual.depositId)).to.be.revertedWith(
        "Core: system paused",
      );
      await expect(withSigner(core, depositor).renewDeposit(manual.depositId, 2)).to.be.revertedWith(
        "Core: system paused",
      );
      await expect(core.autoRenewDeposit(automatic.depositId)).to.be.revertedWith(
        "Core: system paused",
      );
      expect(await core.nextDepositId()).to.equal(nextDepositId);
    });

    it("rounds a sub-unit interest amount down without blocking principal withdrawal", async function () {
      const { core, token, depositor } = await loadFixture(deployBankFixture);
      const planId = await core.nextPlanId();
      await core.createPlan(1, 1, 0, 0, 0);
      const before = await token.balanceOf(depositor.address);
      const { depositId, deposit } = await openDeposit(core, depositor, 1n, planId);

      expect(await core.interestAtMaturity(depositId)).to.equal(0n);
      await time.increaseTo(Number(deposit.maturityAt));
      await withSigner(core, depositor).withdrawAtMaturity(depositId);
      expect(await token.balanceOf(depositor.address)).to.equal(before);
    });
  });
});
