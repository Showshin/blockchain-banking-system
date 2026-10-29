import {
  ACTIVE,
  AUTO_RENEWED,
  PLAN_SHORT,
  assertReserveInvariant,
  completePhase,
  createContext,
  equal,
  eventArg,
  finishWithError,
  latestTimestamp,
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
  if (!(await startPhase(state, "auto-renew"))) return;

  const entry = storedDeposit(state, "T5");
  const gracePeriod = (await context.core.gracePeriod()) as bigint;
  const target = BigInt(entry.maturityAt) + gracePeriod;

  if (!(await readyAt(context, target, "Auto-renew phase"))) {
    console.log(`Latest chain time: ${new Date(Number(await latestTimestamp(context)) * 1000).toISOString()}`);
    return;
  }

  const id = BigInt(entry.id);

  await phaseStep(state, "auto-renew", "autoRenewT5", async () => {
    const before = await readDeposit(context, id);
    const receipt = await sendGuardedCall(
      context,
      state,
      "auto-renew",
      "autoRenewT5",
      context.core,
      "autoRenewDeposit",
      [id],
    );
    const newId = eventArg(context.core, receipt, "Renewed", "newDepositId");
    const newPrincipal = eventArg(context.core, receipt, "Renewed", "newPrincipal");
    equal(newPrincipal, before.principal + BigInt(entry.interestAtMaturity ?? "0"), "T5 renewed principal");

    const oldDeposit = await readDeposit(context, id);
    equal(oldDeposit.status, AUTO_RENEWED, "T5 old status");

    const renewed = await recordDeposit(state, "T5R", newId, receipt.hash, context);
    equal(renewed.planId, PLAN_SHORT, "T5R planId");
    equal(renewed.tenorDays, 1n, "T5R tenor");
    equal(renewed.aprBpsAtOpen, 500n, "T5R APR snapshot");
    equal(renewed.penaltyBpsAtOpen, 100n, "T5R penalty snapshot");
    equal(renewed.principal, newPrincipal, "T5R principal");
    equal(renewed.status, ACTIVE, "T5R status");
    equal(renewed.maturityAt, renewed.openedAt + 86_400n, "T5R maturity");
    equal(
      (await context.core.interestAtMaturity(newId)) as bigint,
      1_370n,
      "T5R reserved interest",
    );

    state.deposits.T5 = { ...entry, status: oldDeposit.status.toString() };
    saveState(state);
    await assertReserveInvariant(context);
  });

  await phaseStep(state, "auto-renew", "invariant", async () => {
    await assertReserveInvariant(context);
  });

  completePhase(state, "auto-renew");
}

main().catch(finishWithError);
