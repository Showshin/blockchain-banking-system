import { expect } from "chai";
import { network } from "hardhat";
import { MaxUint256, parseUnits } from "ethers";
import { GRACE_PERIOD_SECONDS } from "../config/personal";
import { DEPLOYMENT_PLANS } from "../config/plans";
import { SETUP_GAS_LIMITS } from "../scripts/lib/deploy-core";

const USDC = (whole: number) => parseUnits(String(whole), 6);
const MIN_HEADROOM_BPS = 11_500n;
// Sepolia runs a newer fork than the in-process network and charges 2.5x-3.9x
// more for the same setup calls, so the static limits are sized from the chain
// rather than from this measurement. The upper bound only guards against a
// runaway constant; the lower bound is the one that protects against OOG.
const MAX_HEADROOM_BPS = 60_000n;

const { ethers } = await network.create();

describe("deployment gas limits", function () {
  it("keeps static setup limits above measured gas with headroom", async function () {
    const [admin] = await ethers.getSigners();

    const token = await ethers.deployContract("MockUSDC");
    await token.waitForDeployment();
    const tokenReceipt = await token.deploymentTransaction()!.wait();

    const vault = await ethers.deployContract("VaultManager", [
      token.target,
      admin.address,
      admin.address,
    ]);
    await vault.waitForDeployment();
    const vaultReceipt = await vault.deploymentTransaction()!.wait();

    const core = await ethers.deployContract("SavingCore", [
      token.target,
      vault.target,
      GRACE_PERIOD_SECONDS,
    ]);
    await core.waitForDeployment();
    const coreReceipt = await core.deploymentTransaction()!.wait();

    const measured = {
      setCoreOnce: (await (await vault.setCoreOnce(core.target)).wait())!.gasUsed,
      mint: (await (await token.mint(admin.address, USDC(150_000))).wait())!.gasUsed,
      approveVault: (await (await token.approve(vault.target, MaxUint256)).wait())!.gasUsed,
      fundVault: (await (await vault.fundVault(USDC(100_000))).wait())!.gasUsed,
      createPlan: 0n,
    };

    const plan = DEPLOYMENT_PLANS[0]!;
    measured.createPlan = (
      await (
        await core.createPlan(
          plan.tenorDays,
          plan.aprBps,
          plan.minDeposit,
          plan.maxDeposit,
          plan.penaltyBps,
        )
      ).wait()
    )!.gasUsed;

    console.log(
      `deploy gas: MockUSDC ${tokenReceipt!.gasUsed}, VaultManager ${vaultReceipt!.gasUsed}, SavingCore ${coreReceipt!.gasUsed}`,
    );
    console.log(
      `setup gas: ${Object.entries(measured)
        .map(([name, gasUsed]) => `${name} ${gasUsed}`)
        .join(", ")}`,
    );

    for (const [name, gasUsed] of Object.entries(measured) as Array<
      [keyof typeof measured, bigint]
    >) {
      const limit = SETUP_GAS_LIMITS[name];
      expect(limit).to.be.greaterThanOrEqual(
        (gasUsed * MIN_HEADROOM_BPS) / 10_000n,
        `${name} static limit leaves less than 15% headroom`,
      );
      expect(limit).to.be.lessThanOrEqual(
        (gasUsed * MAX_HEADROOM_BPS) / 10_000n,
        `${name} static limit is more than six times the measured gas`,
      );
    }
  });
});
