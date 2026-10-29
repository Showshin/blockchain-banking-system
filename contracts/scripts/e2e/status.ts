import {
  assertReserveInvariant,
  createContext,
  finishWithError,
  latestTimestamp,
  loadState,
  readDeposit,
  readyAt,
  usdc,
} from "./lib";

async function main() {
  const context = await createContext();
  const state = loadState(context);

  console.log(`Network ${state.network} chain ${state.chainId}, deployment ${state.manifestDeployedAt}`);
  console.log(`SavingCore ${state.core}`);
  console.log(
    `Phases: ${Object.entries(state.phases)
      .map(([name, entry]) => `${name}=${entry.status} (${entry.spentWei ?? "0"} wei gas)`)
      .join(", ")}`,
  );

  for (const [key, entry] of Object.entries(state.deposits)) {
    const deposit = await readDeposit(context, BigInt(entry.id));
    const owner = (await context.core.ownerOf(BigInt(entry.id))) as string;
    const interest = (await context.core.interestAtMaturity(BigInt(entry.id))) as bigint;
    console.log(
      `${key}#${entry.id}: plan ${deposit.planId}, principal ${usdc(deposit.principal)}, ` +
        `status ${deposit.status}, interest ${interest} base units, owner ${owner}`,
    );
  }

  const reserved = await assertReserveInvariant(context);
  const vaultBalance = (await context.token.balanceOf(context.manifest.contracts.VaultManager)) as bigint;
  const totalSupply = (await context.token.totalSupply()) as bigint;
  const nextDepositId = (await context.core.nextDepositId()) as bigint;

  console.log(`Vault balance ${usdc(vaultBalance)}; reserved ${reserved} base units; supply ${usdc(totalSupply)}`);
  console.log(`nextDepositId ${nextDepositId}`);

  const t1 = state.deposits.T1;
  if (t1) {
    await readyAt(context, BigInt(t1.maturityAt), "Mature phase");
  }
  const t5 = state.deposits.T5;
  if (t5) {
    const gracePeriod = (await context.core.gracePeriod()) as bigint;
    await readyAt(context, BigInt(t5.maturityAt) + gracePeriod, "Auto-renew phase");
  }
  console.log(`Latest chain time ${new Date(Number(await latestTimestamp(context)) * 1000).toISOString()}`);
}

main().catch(finishWithError);
