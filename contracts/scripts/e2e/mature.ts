import {
  ACTIVE,
  MANUAL_RENEWED,
  PLAN_STANDARD,
  WITHDRAWN,
  assertReserveInvariant,
  check,
  completePhase,
  createContext,
  ensureSecondAccountFunded,
  equal,
  eventArg,
  expectRevert,
  finishWithError,
  latestTimestamp,
  loadSecondAccount,
  loadState,
  phaseStep,
  readDeposit,
  readyAt,
  recordDeposit,
  saveState,
  sendGuardedCall,
  startPhase,
  storedDeposit,
} from "./lib";

async function main() {
  const context = await createContext();
  const state = loadState(context);
  if (!(await startPhase(state, "mature"))) return;

  const keys = ["T1", "T2", "T3", "T4", "T6"];
  let target = 0n;
  for (const key of keys) {
    const entry = storedDeposit(state, key);
    const maturity = BigInt(entry.maturityAt);
    if (maturity > target) target = maturity;
  }

  if (!(await readyAt(context, target, "Mature phase"))) {
    console.log(`Latest chain time: ${new Date(Number(await latestTimestamp(context)) * 1000).toISOString()}`);
    return;
  }

  const depositId = (key: string) => BigInt(storedDeposit(state, key).id);

  const withdrawAtMaturity = async (key: string, expectedInterest?: bigint) => {
    const id = depositId(key);
    const stored = storedDeposit(state, key);
    const current = await readDeposit(context, id);
    if (key === "T1" && current.status === WITHDRAWN) {
      console.log("T1 was already withdrawn on chain; skipping maturity settlement.");
      state.deposits.T1 = { ...stored, status: current.status.toString() };
      saveState(state);
      return;
    }
    check(current.status === ACTIVE, `${key} is not active (status ${current.status})`);
    const receipt = await sendGuardedCall(
      context,
      state,
      "mature",
      `withdraw${key}`,
      context.core,
      "withdrawAtMaturity",
      [id],
    );
    const interest = eventArg(context.core, receipt, "Withdrawn", "interest");
    equal(
      interest,
      BigInt(stored.interestAtMaturity ?? "0"),
      `${key} maturity interest matches the observed reservation`,
    );
    if (expectedInterest !== undefined) equal(interest, expectedInterest, `${key} expected interest`);
    const deposit = await readDeposit(context, id);
    equal(deposit.status, WITHDRAWN, `${key} status`);
    state.deposits[key] = { ...stored, status: deposit.status.toString() };
    saveState(state);
    await assertReserveInvariant(context);
  };

  await phaseStep(state, "mature", "withdrawT1", () => withdrawAtMaturity("T1", 1_369n));
  await phaseStep(state, "mature", "withdrawT2", () => withdrawAtMaturity("T2", 2_739n));
  await phaseStep(state, "mature", "withdrawT3", () => withdrawAtMaturity("T3"));

  await phaseStep(state, "mature", "withdrawT4", async () => {
    const id = depositId("T4");
    const owner = (await context.core.ownerOf(id)) as string;
    const second = loadSecondAccount(context);

    if (second && owner.toLowerCase() === second.address.toLowerCase()) {
      await expectRevert(
        () => context.core.withdrawAtMaturity.staticCall(id),
        "withdrawal by the previous certificate owner",
        /not certificate owner/,
      );
      await ensureSecondAccountFunded(context, state, "mature", second);
      const receipt = await sendGuardedCall(
        context,
        state,
        "mature",
        "withdrawT4ByNewOwner",
        context.core,
        "withdrawAtMaturity",
        [id],
        { signer: second.signer },
      );
      equal(
        eventArg(context.core, receipt, "Withdrawn", "interest"),
        BigInt(storedDeposit(state, "T4").interestAtMaturity ?? "0"),
        "T4 interest after ownership transfer",
      );
    } else {
      console.log("T4 ownership transfer was skipped; settling as the original owner.");
      const receipt = await sendGuardedCall(
        context,
        state,
        "mature",
        "withdrawT4ByOwner",
        context.core,
        "withdrawAtMaturity",
        [id],
      );
      equal(
        eventArg(context.core, receipt, "Withdrawn", "interest"),
        BigInt(storedDeposit(state, "T4").interestAtMaturity ?? "0"),
        "T4 interest",
      );
    }

    const deposit = await readDeposit(context, id);
    equal(deposit.status, WITHDRAWN, "T4 status");
    state.deposits.T4 = { ...storedDeposit(state, "T4"), status: deposit.status.toString() };
    saveState(state);
    await assertReserveInvariant(context);
  });

  await phaseStep(state, "mature", "renewT6", async () => {
    const id = depositId("T6");
    const before = await readDeposit(context, id);
    const receipt = await sendGuardedCall(
      context,
      state,
      "mature",
      "renewT6",
      context.core,
      "renewDeposit",
      [id, PLAN_STANDARD],
    );
    const newId = eventArg(context.core, receipt, "Renewed", "newDepositId");
    const newPrincipal = eventArg(context.core, receipt, "Renewed", "newPrincipal");
    const newPlanId = eventArg(context.core, receipt, "Renewed", "newPlanId");
    equal(newPlanId, PLAN_STANDARD, "T6 renewed plan id");
    equal(
      newPrincipal,
      before.principal + BigInt(storedDeposit(state, "T6").interestAtMaturity ?? "0"),
      "T6 renewed principal",
    );

    const oldDeposit = await readDeposit(context, id);
    equal(oldDeposit.status, MANUAL_RENEWED, "T6 old status");
    const renewed = await recordDeposit(state, "T6R", newId, receipt.hash, context);
    equal(renewed.planId, PLAN_STANDARD, "T6R planId");
    equal(renewed.tenorDays, 90n, "T6R tenor");
    equal(renewed.aprBpsAtOpen, 225n, "T6R APR snapshot");
    equal(renewed.penaltyBpsAtOpen, 400n, "T6R penalty snapshot");
    equal(renewed.principal, newPrincipal, "T6R principal");
    equal(renewed.status, ACTIVE, "T6R status");
    state.deposits.T6 = { ...storedDeposit(state, "T6"), status: oldDeposit.status.toString() };
    saveState(state);
    await assertReserveInvariant(context);
  });

  await phaseStep(state, "mature", "invariant", async () => {
    await assertReserveInvariant(context);
  });

  completePhase(state, "mature");
}

main().catch(finishWithError);
