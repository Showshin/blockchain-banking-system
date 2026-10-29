import {
  ACTIVE,
  PLAN_FAST,
  PLAN_SHORT,
  USDC,
  WITHDRAWN,
  assertReserveInvariant,
  check,
  completePhase,
  createContext,
  ensureSecondAccountFunded,
  equal,
  eventArg,
  eventBool,
  expectRevert,
  finishWithError,
  loadSecondAccount,
  loadState,
  phaseStep,
  readDeposit,
  recordDeposit,
  saveState,
  sendGuardedCall,
  startPhase,
  storedDeposit,
} from "./lib";

async function main() {
  const context = await createContext();
  const state = loadState(context);
  if (!(await startPhase(state, "immediate"))) return;

  const depositId = (key: string) => BigInt(storedDeposit(state, key).id);

  await phaseStep(state, "immediate", "preflight", async () => {
    check((await context.vault.paused()) === false, "Vault is paused.");
    const plan = (await context.core.plans(PLAN_SHORT)) as { enabled: boolean; tenorDays: bigint };
    check(plan.enabled && plan.tenorDays === 1n, "Plan 5 is not the enabled one-day plan.");
    const balance = (await context.token.balanceOf(context.deployerAddress)) as bigint;
    check(balance >= USDC(300), "Deployer needs at least 300 USDC for the immediate phase.");
    const reserved = await assertReserveInvariant(context);
    console.log(`Deployer ${context.deployerAddress}, token balance ${balance}, reserved ${reserved}.`);
  });

  await phaseStep(state, "immediate", "approveCore", async () => {
    const allowance = (await context.token.allowance(
      context.deployerAddress,
      context.manifest.contracts.SavingCore,
    )) as bigint;
    if (allowance >= USDC(300)) {
      console.log(`SavingCore allowance already ${allowance}.`);
      return;
    }
    await sendGuardedCall(
      context,
      state,
      "immediate",
      "approveCore",
      context.token,
      "approve",
      [context.manifest.contracts.SavingCore, USDC(1_000)],
    );
  });

  await phaseStep(state, "immediate", "openD1", async () => {
    const receipt = await sendGuardedCall(
      context,
      state,
      "immediate",
      "openD1",
      context.core,
      "openDeposit",
      [PLAN_FAST, USDC(100)],
    );
    const id = eventArg(context.core, receipt, "DepositOpened", "depositId");
    const deposit = await recordDeposit(state, "D1", id, receipt.hash, context, receipt.blockNumber);
    equal(deposit.planId, PLAN_FAST, "D1 planId");
    equal(deposit.principal, USDC(100), "D1 principal");
    equal(deposit.aprBpsAtOpen, 175n, "D1 APR snapshot");
    equal(deposit.penaltyBpsAtOpen, 200n, "D1 penalty snapshot");
    equal(deposit.tenorDays, 30n, "D1 tenor");
    equal(deposit.maturityAt, deposit.openedAt + 30n * 86_400n, "D1 maturity");
    equal(deposit.status, ACTIVE, "D1 status");
    equal(
      (await context.core.ownerOf(id)) as string,
      context.deployerAddress,
      "D1 certificate owner",
    );
    await assertReserveInvariant(context);
  });

  await phaseStep(state, "immediate", "topUpD1", async () => {
    const id = depositId("D1");
    const before = (await context.core.interestAtMaturity(id)) as bigint;
    const receipt = await sendGuardedCall(
      context,
      state,
      "immediate",
      "topUpD1",
      context.core,
      "topUpDeposit",
      [id, USDC(50)],
    );
    const added = eventArg(context.core, receipt, "DepositToppedUp", "interestAdded");
    const after = (await context.core.interestAtMaturity(id, {
      blockTag: receipt.blockNumber,
    })) as bigint;
    equal(added, after - before, "top-up interestAdded");
    check(added > 0n, "Top-up should add interest to the reservation.");
    const deposit = await readDeposit(context, id, receipt.blockNumber);
    equal(deposit.principal, USDC(150), "D1 principal after top-up");
    state.deposits.D1 = {
      ...storedDeposit(state, "D1"),
      principal: deposit.principal.toString(),
      interestAtMaturity: after.toString(),
    };
    saveState(state);
    await assertReserveInvariant(context);
  });

  await phaseStep(state, "immediate", "partialD1", async () => {
    const id = depositId("D1");
    const receipt = await sendGuardedCall(
      context,
      state,
      "immediate",
      "partialD1",
      context.core,
      "earlyWithdrawPartial",
      [id, USDC(40)],
    );
    equal(eventArg(context.core, receipt, "PartialEarlyWithdrawn", "penalty"), USDC(0.8), "partial penalty");
    equal(
      eventArg(context.core, receipt, "PartialEarlyWithdrawn", "remainingPrincipal"),
      USDC(110),
      "partial remaining principal",
    );
    const deposit = await readDeposit(context, id, receipt.blockNumber);
    equal(deposit.principal, USDC(110), "D1 principal after partial withdrawal");
    equal(deposit.status, ACTIVE, "D1 status after partial withdrawal");
    await expectRevert(
      () => context.core.earlyWithdrawPartial.staticCall(id, USDC(60)),
      "partial withdrawal below the plan minimum",
      /remaining below minimum/,
    );
    state.deposits.D1 = {
      ...storedDeposit(state, "D1"),
      principal: deposit.principal.toString(),
      interestAtMaturity: (
        (await context.core.interestAtMaturity(id, {
          blockTag: receipt.blockNumber,
        })) as bigint
      ).toString(),
    };
    saveState(state);
    await assertReserveInvariant(context);
  });

  await phaseStep(state, "immediate", "pauseProbes", async () => {
    const id = depositId("D1");
    await sendGuardedCall(context, state, "immediate", "pauseVault", context.vault, "pause", []);
    await expectRevert(
      () => context.core.openDeposit.staticCall(PLAN_FAST, USDC(100)),
      "open while paused",
      /system paused/,
    );
    await expectRevert(
      () => context.core.topUpDeposit.staticCall(id, USDC(1)),
      "top-up while paused",
      /system paused/,
    );
    await expectRevert(
      () => context.core.earlyWithdraw.staticCall(id),
      "early withdrawal while paused",
      /system paused/,
    );
    await sendGuardedCall(context, state, "immediate", "unpauseVault", context.vault, "unpause", []);
  });

  await phaseStep(state, "immediate", "roleProbes", async () => {
    const coreRole = (await context.vault.CORE_ROLE()) as string;
    await expectRevert(
      () => context.vault.setCoreOnce.staticCall(context.manifest.contracts.SavingCore),
      "second setCoreOnce",
      /core already set/,
    );
    await expectRevert(
      () => context.vault.grantRole.staticCall(coreRole, context.deployerAddress),
      "grantRole CORE_ROLE",
    );
    await expectRevert(
      () => context.vault.reserveInterest.staticCall(1n),
      "reserveInterest from the deployer",
    );
  });

  await phaseStep(state, "immediate", "reserveProbes", async () => {
    const vaultAddress = context.manifest.contracts.VaultManager;
    const reserved = (await context.vault.reservedInterest()) as bigint;
    const vaultBalance = (await context.token.balanceOf(vaultAddress)) as bigint;
    await expectRevert(
      () => context.vault.withdrawVault.staticCall(vaultBalance - reserved + 1n),
      "withdraw above the unreserved balance",
      /reserved interest/,
    );
    const before = vaultBalance;
    await sendGuardedCall(
      context,
      state,
      "immediate",
      "withdrawUnreserved",
      context.vault,
      "withdrawVault",
      [USDC(1)],
    );
    await sendGuardedCall(
      context,
      state,
      "immediate",
      "refundVault",
      context.vault,
      "fundVault",
      [USDC(1)],
    );
    equal((await context.token.balanceOf(vaultAddress)) as bigint, before, "vault balance after refund");
    await assertReserveInvariant(context);
  });

  await phaseStep(state, "immediate", "closeD1", async () => {
    const id = depositId("D1");
    const feeReceiver = (await context.vault.feeReceiver()) as string;
    const feeBefore = (await context.token.balanceOf(feeReceiver)) as bigint;
    const receipt = await sendGuardedCall(
      context,
      state,
      "immediate",
      "earlyWithdrawD1",
      context.core,
      "earlyWithdraw",
      [id],
    );
    equal(eventBool(context.core, receipt, "Withdrawn", "isEarly"), true, "Withdrawn isEarly flag");
    const deposit = await readDeposit(context, id, receipt.blockNumber);
    equal(deposit.status, WITHDRAWN, "D1 status after early withdrawal");
    const feeAfter = (await context.token.balanceOf(feeReceiver)) as bigint;
    const expected = feeReceiver.toLowerCase() === context.deployerAddress.toLowerCase()
      ? USDC(110)
      : USDC(2.2);
    equal(feeAfter - feeBefore, expected, "early withdrawal payout");
    state.deposits.D1 = { ...storedDeposit(state, "D1"), status: deposit.status.toString() };
    saveState(state);
    await assertReserveInvariant(context);
  });

  const future = [
    { key: "T1", amount: USDC(10) },
    { key: "T2", amount: USDC(30) },
    { key: "T3", amount: USDC(10) },
    { key: "T4", amount: USDC(10) },
    { key: "T5", amount: USDC(10) },
    { key: "T6", amount: USDC(10) },
  ];

  for (const item of future) {
    await phaseStep(state, "immediate", `open${item.key}`, async () => {
      const receipt = await sendGuardedCall(
        context,
        state,
        "immediate",
        `open${item.key}`,
        context.core,
        "openDeposit",
        [PLAN_SHORT, item.amount],
      );
      const id = eventArg(context.core, receipt, "DepositOpened", "depositId");
      const deposit = await recordDeposit(
        state,
        item.key,
        id,
        receipt.hash,
        context,
        receipt.blockNumber,
      );
      equal(deposit.planId, PLAN_SHORT, `${item.key} planId`);
      equal(deposit.principal, item.amount, `${item.key} principal`);
      equal(deposit.aprBpsAtOpen, 500n, `${item.key} APR snapshot`);
      equal(deposit.penaltyBpsAtOpen, 100n, `${item.key} penalty snapshot`);
      equal(deposit.tenorDays, 1n, `${item.key} tenor`);
      equal(deposit.maturityAt, deposit.openedAt + 86_400n, `${item.key} maturity`);
      equal(deposit.status, ACTIVE, `${item.key} status`);
    });
  }

  await phaseStep(state, "immediate", "partialT2", async () => {
    const id = depositId("T2");
    const receipt = await sendGuardedCall(
      context,
      state,
      "immediate",
      "partialT2",
      context.core,
      "earlyWithdrawPartial",
      [id, USDC(10)],
    );
    equal(eventArg(context.core, receipt, "PartialEarlyWithdrawn", "penalty"), USDC(0.1), "T2 penalty");
    equal(
      eventArg(context.core, receipt, "PartialEarlyWithdrawn", "remainingPrincipal"),
      USDC(20),
      "T2 remaining principal",
    );
    const deposit = await readDeposit(context, id, receipt.blockNumber);
    state.deposits.T2 = {
      ...storedDeposit(state, "T2"),
      principal: deposit.principal.toString(),
      interestAtMaturity: (
        (await context.core.interestAtMaturity(id, {
          blockTag: receipt.blockNumber,
        })) as bigint
      ).toString(),
    };
    saveState(state);
  });

  await phaseStep(state, "immediate", "topUpT3", async () => {
    const id = depositId("T3");
    const current = await readDeposit(context, id);
    if (current.principal === USDC(10)) {
      const receipt = await sendGuardedCall(
        context,
        state,
        "immediate",
        "topUpT3",
        context.core,
        "topUpDeposit",
        [id, USDC(10)],
      );
      check(
        eventArg(context.core, receipt, "DepositToppedUp", "interestAdded") > 0n,
        "Top-up added no interest.",
      );
      const deposit = await readDeposit(context, id, receipt.blockNumber);
      equal(deposit.principal, USDC(20), "T3 principal after top-up");
      state.deposits.T3 = {
        ...storedDeposit(state, "T3"),
        principal: deposit.principal.toString(),
        interestAtMaturity: (
          (await context.core.interestAtMaturity(id, {
            blockTag: receipt.blockNumber,
          })) as bigint
        ).toString(),
      };
    } else {
      equal(current.principal, USDC(20), "T3 principal after top-up");
      console.log("topUpT3 was already applied on chain; reconciling state.");
      state.deposits.T3 = {
        ...storedDeposit(state, "T3"),
        principal: current.principal.toString(),
        interestAtMaturity: ((await context.core.interestAtMaturity(id)) as bigint).toString(),
      };
    }
    saveState(state);
  });

  const second = loadSecondAccount(context);
  if (second) {
    state.secondAccount = { address: second.address, source: "env" };
    saveState(state);
    await phaseStep(state, "immediate", "fundSecondAccount", async () => {
      await ensureSecondAccountFunded(context, state, "immediate", second);
    });
    await phaseStep(state, "immediate", "transferT4", async () => {
      const id = depositId("T4");
      await sendGuardedCall(
        context,
        state,
        "immediate",
        "transferT4",
        context.core,
        "transferFrom",
        [context.deployerAddress, second.address, id],
      );
      equal((await context.core.ownerOf(id)) as string, second.address, "T4 certificate owner");
    });
  } else {
    state.secondAccount = { address: null, source: "none" };
    saveState(state);
    console.log("T4 NFT transfer skipped: no E2E_SECOND_PRIVATE_KEY or TEST_ACCOUNT_PRIVATE_KEY.");
  }

  await assertReserveInvariant(context);
  await phaseStep(state, "immediate", "invariant", async () => {
    await assertReserveInvariant(context);
  });

  completePhase(state, "immediate");
  console.log(
    `Immediate phase done. Deposits: ${Object.entries(state.deposits)
      .map(([key, entry]) => `${key}#${entry.id}`)
      .join(", ")}`,
  );
}

main().catch(finishWithError);
