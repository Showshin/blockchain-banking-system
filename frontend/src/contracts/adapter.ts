import {
  BrowserProvider,
  Contract,
  MaxUint256,
  formatUnits,
  parseUnits,
  type ContractTransactionReceipt,
} from 'ethers'
import { messages } from '../i18n/messages'
import type { Deposit, DepositStatus, SavingPlan } from '../types'
import { MockUSDCAbi, SavingCoreAbi, VaultManagerAbi } from './abis'
import { contractConfig, type ContractConfig } from './config'
import { providerFor } from './wallet'

const WITHDRAWN = 2n
const MANUAL_RENEWED = 3n
const AUTO_RENEWED = 4n
const PRINCIPAL_WITHDRAWN = 5n

type ChainPlan = {
  tenorDays: bigint
  aprBps: bigint
  minDeposit: bigint
  maxDeposit: bigint
  earlyWithdrawPenaltyBps: bigint
  enabled: boolean
}

type ChainDeposit = {
  planId: bigint
  principal: bigint
  aprBpsAtOpen: bigint
  penaltyBpsAtOpen: bigint
  tenorDays: bigint
  openedAt: bigint
  maturityAt: bigint
  status: bigint
}

export interface ChainSnapshot {
  plans: SavingPlan[]
  deposits: Deposit[]
  walletBalance: number
  vaultBalance: number
  coreBalance: number
  vaultReserved: number
  vaultPaused: boolean
  vaultCore: string | null
  vaultFeeReceiver: string | null
  roles: { admin: boolean; pauser: boolean; planManager: boolean }
}

export interface WithdrawReceipt {
  kind: 'early' | 'partial' | 'mature'
  interest: number
  penalty: number
  payout: number
  remainingPrincipal: number
  pendingInterest: number
}

export interface ClaimReceipt {
  interest: number
}

export interface TopUpReceipt {
  amount: number
  newPrincipal: number
  interestAdded: number
}

function requireConfig(): ContractConfig {
  if (!contractConfig) throw new Error('Contract configuration is incomplete.')
  return contractConfig
}

function requireEthereum(): NonNullable<Window['ethereum']> {
  return providerFor()
}

async function readContracts() {
  const config = requireConfig()
  const provider = new BrowserProvider(requireEthereum())
  return {
    provider,
    usdc: new Contract(config.usdcAddress, MockUSDCAbi, provider),
    core: new Contract(config.coreAddress, SavingCoreAbi, provider),
    vault: new Contract(config.vaultAddress, VaultManagerAbi, provider),
  }
}

async function writeContracts(address: string) {
  const config = requireConfig()
  const provider = new BrowserProvider(requireEthereum())
  const signer = await provider.getSigner(address)
  return {
    provider,
    usdc: new Contract(config.usdcAddress, MockUSDCAbi, signer),
    core: new Contract(config.coreAddress, SavingCoreAbi, signer),
    vault: new Contract(config.vaultAddress, VaultManagerAbi, signer),
  }
}

// ethers v6 exposes event arguments through a proxy, so `field in args` is
// always false. Read the value instead.
function argsOf(log: unknown, field: string): Record<string, bigint | boolean> | null {
  if (!log || typeof log !== 'object') return null
  const args = (log as { args?: Record<string, bigint | boolean> }).args
  if (!args || args[field] === undefined) return null
  return args
}

function asNumber(value: bigint): number {
  return Number(formatUnits(value, 6))
}

function statusFromChain(status: bigint): DepositStatus {
  if (status === WITHDRAWN) return 'withdrawn'
  if (status === MANUAL_RENEWED) return 'manual-renewed'
  if (status === AUTO_RENEWED) return 'auto-renewed'
  if (status === PRINCIPAL_WITHDRAWN) return 'principal-withdrawn'
  return 'active'
}

function planName(tenorDays: number): SavingPlan['name'] {
  return {
    vi: messages.vi.chain.planName(tenorDays),
    en: messages.en.chain.planName(tenorDays),
  }
}

function planDescription(tenorDays: number): SavingPlan['description'] {
  return {
    vi: messages.vi.chain.planDescription(tenorDays),
    en: messages.en.chain.planDescription(tenorDays),
  }
}

function toPlan(id: number, source: ChainPlan): SavingPlan {
  const tenorDays = Number(source.tenorDays)
  return {
    id: `chain-${id}`,
    name: planName(tenorDays),
    tenorDays,
    aprBps: Number(source.aprBps),
    minDeposit: asNumber(source.minDeposit),
    maxDeposit: source.maxDeposit === 0n ? Number.MAX_SAFE_INTEGER / 1_000_000 : asNumber(source.maxDeposit),
    penaltyBps: Number(source.earlyWithdrawPenaltyBps),
    enabled: source.enabled,
    popular: tenorDays === 90,
    description: planDescription(tenorDays),
  }
}

function chainPlanId(planId: string): bigint {
  const match = /^chain-(\d+)$/.exec(planId)
  if (!match) throw new Error('Unknown on-chain plan.')
  return BigInt(match[1])
}

function toDeposit(
  id: bigint,
  source: ChainDeposit,
  owner: string,
  interestAtMaturity: bigint,
  pendingInterest: bigint,
  withdrawal?: { interest: bigint; isEarly: boolean },
): Deposit {
  return {
    id: `chain-${id}`,
    certificateNo: Number(id),
    planId: `chain-${source.planId}`,
    principal: asNumber(source.principal),
    aprBpsAtOpen: Number(source.aprBpsAtOpen),
    penaltyBpsAtOpen: Number(source.penaltyBpsAtOpen),
    tenorDays: Number(source.tenorDays),
    openedAt: new Date(Number(source.openedAt) * 1_000).toISOString(),
    maturityAt: new Date(Number(source.maturityAt) * 1_000).toISOString(),
    status: statusFromChain(source.status),
    owner,
    interestAtMaturity: asNumber(interestAtMaturity),
    pendingInterest: asNumber(pendingInterest),
    realizedInterest: withdrawal ? asNumber(withdrawal.interest) : undefined,
    withdrawnEarly: withdrawal?.isEarly,
  }
}

async function readDepositSource(
  core: Contract,
  id: bigint,
  blockTag?: number,
): Promise<ChainDeposit> {
  return (blockTag === undefined
    ? await core.deposits(id)
    : await core.deposits(id, { blockTag })) as ChainDeposit
}

async function readDeposit(
  core: Contract,
  id: bigint,
  owner: string,
  blockTag?: number,
  pendingInterest = 0n,
): Promise<Deposit> {
  // A load-balanced RPC can serve a stale latest block immediately after a
  // receipt. Read against the receipt block so the returned certificate is
  // never rendered with zeroed state.
  const [source, interest] = (await Promise.all([
    readDepositSource(core, id, blockTag),
    blockTag === undefined
      ? core.interestAtMaturity(id)
      : core.interestAtMaturity(id, { blockTag }),
  ])) as [ChainDeposit, bigint]
  return toDeposit(id, source, owner, interest, pendingInterest)
}

function eventDepositId(core: Contract, receipt: ContractTransactionReceipt): bigint {
  for (const log of receipt.logs) {
    try {
      const parsed = core.interface.parseLog(log)
      if (parsed?.name === 'DepositOpened') return parsed.args.depositId as bigint
    } catch {
      // A transaction may contain logs from the token as well as SavingCore.
    }
  }
  throw new Error('The deposit event was not found in the transaction receipt.')
}

function eventArgs(
  core: Contract,
  receipt: ContractTransactionReceipt,
  name: string,
): Record<string, unknown> | null {
  for (const log of receipt.logs) {
    try {
      const parsed = core.interface.parseLog(log)
      if (parsed?.name === name) return parsed.args as Record<string, unknown>
    } catch {
      // A transaction may contain logs from the token as well as SavingCore.
    }
  }
  return null
}

function eventPartialWithdrawal(
  core: Contract,
  receipt: ContractTransactionReceipt,
): { penalty: bigint; remainingPrincipal: bigint } {
  for (const log of receipt.logs) {
    try {
      const parsed = core.interface.parseLog(log)
      if (parsed?.name === 'PartialEarlyWithdrawn') {
        return {
          penalty: parsed.args.penalty as bigint,
          remainingPrincipal: parsed.args.remainingPrincipal as bigint,
        }
      }
    } catch {
      // A transaction may contain logs from the token as well as SavingCore.
    }
  }
  throw new Error('The partial withdrawal event was not found in the transaction receipt.')
}

export async function assertConfiguredNetwork(): Promise<void> {
  const config = requireConfig()
  const provider = new BrowserProvider(requireEthereum())
  const network = await provider.getNetwork()
  if (network.chainId !== BigInt(config.chainId)) {
    throw new Error(`WRONG_NETWORK:${config.chainId}`)
  }
}

export async function loadChainSnapshot(address: string): Promise<ChainSnapshot> {
  await assertConfiguredNetwork()
  const config = requireConfig()
  const { usdc, core, vault } = await readContracts()
  const nextPlanId = Number(await core.nextPlanId())
  const planEntries = await Promise.all(
    Array.from({ length: Math.max(0, nextPlanId - 1) }, async (_, index) => {
      const id = index + 1
      return toPlan(id, (await core.plans(BigInt(id))) as ChainPlan)
    }),
  )

  const opened = await core.queryFilter(
    core.filters.DepositOpened(),
    config.deploymentBlock,
    'latest',
  )
  // The deposit struct does not record how a position was closed, so the
  // Withdrawn event is the only source for early-vs-maturity and the interest
  // that was actually paid.
  const settled = await core.queryFilter(
    core.filters.Withdrawn(),
    config.deploymentBlock,
    'latest',
  )
  const withdrawals = new Map<string, { interest: bigint; isEarly: boolean }>()
  for (const log of settled) {
    if (!('args' in log)) continue
    const args = log.args as unknown as {
      depositId: bigint
      interest: bigint
      isEarly: boolean
    }
    withdrawals.set(args.depositId.toString(), {
      interest: args.interest,
      isEarly: args.isEarly,
    })
  }
  const ids = [
    ...new Set(
      opened.map((event) =>
        ('args' in event ? (event.args.depositId as bigint) : 0n).toString(),
      ),
    ),
  ]
    .filter((id) => id !== '0')
    .map(BigInt)
  const deposits = (
    await Promise.all(
      ids.map(async (id) => {
        // A burned certificate has no owner, so ownerOf reverts. Skip it rather
        // than failing the whole snapshot.
        let owner: string
        try {
          owner = (await core.ownerOf(id)) as string
        } catch {
          return null
        }
        if (owner.toLowerCase() !== address.toLowerCase()) return null

        const [source, interest, pending] = await Promise.all([
          readDepositSource(core, id),
          core.interestAtMaturity(id) as Promise<bigint>,
          core.pendingInterest(id) as Promise<bigint>,
        ])
        // Settled certificates stay in the snapshot so the history page can
        // record them. The deposits page filters for open positions only.
        return toDeposit(id, source, owner, interest, pending, withdrawals.get(id.toString()))
      }),
    )
  ).filter((deposit): deposit is Deposit => deposit !== null)

  const [walletBalance, vaultBalance, coreBalance, reserved, paused, vaultCore, feeReceiver] =
    await Promise.all([
      usdc.balanceOf(address) as Promise<bigint>,
      usdc.balanceOf(config.vaultAddress) as Promise<bigint>,
      usdc.balanceOf(config.coreAddress) as Promise<bigint>,
      vault.reservedInterest() as Promise<bigint>,
      vault.paused() as Promise<boolean>,
      vault.core() as Promise<string>,
      vault.feeReceiver() as Promise<string>,
    ])
  const [adminRole, pauserRole, planManagerRole] = await Promise.all([
    core.DEFAULT_ADMIN_ROLE() as Promise<string>,
    vault.PAUSER_ROLE() as Promise<string>,
    core.PLAN_MANAGER_ROLE() as Promise<string>,
  ])
  const [isAdmin, isPauser, isPlanManager] = await Promise.all([
    core.hasRole(adminRole, address) as Promise<boolean>,
    vault.hasRole(pauserRole, address) as Promise<boolean>,
    core.hasRole(planManagerRole, address) as Promise<boolean>,
  ])

  return {
    plans: planEntries,
    deposits: deposits.sort((a, b) => b.certificateNo - a.certificateNo),
    walletBalance: asNumber(walletBalance),
    vaultBalance: asNumber(vaultBalance),
    coreBalance: asNumber(coreBalance),
    vaultReserved: asNumber(reserved),
    vaultPaused: paused,
    vaultCore: vaultCore === '0x0000000000000000000000000000000000000000' ? null : vaultCore,
    vaultFeeReceiver:
      feeReceiver === '0x0000000000000000000000000000000000000000' ? null : feeReceiver,
    roles: { admin: isAdmin, pauser: isPauser, planManager: isPlanManager },
  }
}

export async function openChainDeposit(
  address: string,
  planId: string,
  amount: number,
): Promise<Deposit> {
  const { core, usdc } = await writeContracts(address)
  const id = chainPlanId(planId)
  const units = parseUnits(amount.toFixed(6), 6)
  const allowance = (await usdc.allowance(address, contractConfig?.coreAddress)) as bigint
  if (allowance < units) {
    await (await usdc.approve(contractConfig?.coreAddress, MaxUint256)).wait()
  }
  const receipt = (await (await core.openDeposit(id, units)).wait()) as ContractTransactionReceipt
  const depositId = eventDepositId(core, receipt)
  return readDeposit(core, depositId, address, receipt.blockNumber)
}

export async function withdrawChainDeposit(
  address: string,
  depositId: string,
): Promise<{ deposit: Deposit; receipt: WithdrawReceipt }> {
  const id = BigInt(depositId.replace('chain-', ''))
  const { provider, core } = await writeContracts(address)
  const before = await readDeposit(core, id, address)
  const interestUnits = (await core.interestAtMaturity(id)) as bigint
  const penaltyUnits = (await core.earlyWithdrawalPenalty(id)) as bigint
  const latestBlock = await provider.getBlock('latest')
  const chainNow = Number(latestBlock?.timestamp ?? 0) * 1_000
  const matured = chainNow >= new Date(before.maturityAt).getTime()

  const receipt = (await (
    matured ? core.withdrawAtMaturity(id) : core.earlyWithdraw(id)
  ).then((tx) => tx.wait())) as ContractTransactionReceipt

  const deferred = eventArgs(core, receipt, 'InterestDeferred')
  const deferredUnits = deferred ? (deferred.amount as bigint) : 0n
  const paidInterestUnits = matured ? interestUnits - deferredUnits : 0n
  const pendingInterest = asNumber(deferredUnits)
  const status: DepositStatus = pendingInterest > 0 ? 'principal-withdrawn' : 'withdrawn'
  return {
    deposit: { ...before, status, pendingInterest },
    receipt: {
      kind: matured ? 'mature' : 'early',
      interest: asNumber(paidInterestUnits),
      penalty: matured ? 0 : asNumber(penaltyUnits),
      payout:
        before.principal +
        asNumber(paidInterestUnits) -
        (matured ? 0 : asNumber(penaltyUnits)),
      remainingPrincipal: 0,
      pendingInterest,
    },
  }
}

export async function withdrawChainDepositPartial(
  address: string,
  depositId: string,
  amount: number,
): Promise<{ deposit: Deposit; receipt: WithdrawReceipt }> {
  const id = BigInt(depositId.replace('chain-', ''))
  const { core } = await writeContracts(address)
  const before = await readDeposit(core, id, address)
  const units = parseUnits(amount.toFixed(6), 6)
  const receipt = (await (
    await core.earlyWithdrawPartial(id, units)
  ).wait()) as ContractTransactionReceipt
  const { penalty, remainingPrincipal } = eventPartialWithdrawal(core, receipt)
  return {
    deposit: { ...before, principal: asNumber(remainingPrincipal) },
    receipt: {
      kind: 'partial',
      interest: 0,
      penalty: asNumber(penalty),
      payout: asNumber(units - penalty),
      remainingPrincipal: asNumber(remainingPrincipal),
      pendingInterest: 0,
    },
  }
}

export async function renewChainDeposit(
  address: string,
  depositId: string,
  newPlanId: string,
): Promise<Deposit> {
  const oldId = BigInt(depositId.replace('chain-', ''))
  const { core } = await writeContracts(address)
  const receipt = (await (
    await core.renewDeposit(oldId, chainPlanId(newPlanId))
  ).wait()) as ContractTransactionReceipt
  return readDeposit(core, eventDepositId(core, receipt), address, receipt.blockNumber)
}

export async function topUpChainDeposit(
  address: string,
  depositId: string,
  amount: number,
): Promise<{ deposit: Deposit; receipt: TopUpReceipt }> {
  const id = BigInt(depositId.replace('chain-', ''))
  const { core, usdc } = await writeContracts(address)
  const units = parseUnits(amount.toFixed(6), 6)
  const allowance = (await usdc.allowance(address, contractConfig?.coreAddress)) as bigint
  if (allowance < units) {
    await (await usdc.approve(contractConfig?.coreAddress, MaxUint256)).wait()
  }
  const receipt = (await (
    await core.topUpDeposit(id, units)
  ).wait()) as ContractTransactionReceipt
  const args = eventArgs(core, receipt, 'DepositToppedUp')
  if (!args) throw new Error('The top-up event was not found in the transaction receipt.')
  return {
    deposit: await readDeposit(core, id, address, receipt.blockNumber),
    receipt: {
      amount: asNumber(args.amount as bigint),
      newPrincipal: asNumber(args.newPrincipal as bigint),
      interestAdded: asNumber(args.interestAdded as bigint),
    },
  }
}

export async function claimChainInterest(
  address: string,
  depositId: string,
): Promise<ClaimReceipt> {
  const id = BigInt(depositId.replace('chain-', ''))
  const { core } = await writeContracts(address)
  const receipt = (await (
    await core.claimInterest(id)
  ).wait()) as ContractTransactionReceipt
  const args = eventArgs(core, receipt, 'InterestClaimed')
  if (!args) throw new Error('The interest claim event was not found in the transaction receipt.')
  return { interest: asNumber(args.amount as bigint) }
}

/** Admin operations. Every call reverts on chain unless the signer holds the role. */
export async function setVaultPaused(address: string, paused: boolean): Promise<string> {
  const { vault } = await writeContracts(address)
  const receipt = (await (await (paused ? vault.pause() : vault.unpause())).wait()) as ContractTransactionReceipt
  return receipt.hash
}

export async function fundChainVault(address: string, amount: number): Promise<string> {
  const { usdc, vault } = await writeContracts(address)
  const units = parseUnits(amount.toFixed(6), 6)
  const allowance = (await usdc.allowance(address, contractConfig?.vaultAddress)) as bigint
  if (allowance < units) {
    await (await usdc.approve(contractConfig?.vaultAddress, MaxUint256)).wait()
  }
  const receipt = (await (await vault.fundVault(units)).wait()) as ContractTransactionReceipt
  return receipt.hash
}

export async function withdrawChainVault(address: string, amount: number): Promise<string> {
  const { vault } = await writeContracts(address)
  const units = parseUnits(amount.toFixed(6), 6)
  const receipt = (await (await vault.withdrawVault(units)).wait()) as ContractTransactionReceipt
  return receipt.hash
}

export async function setChainPlanEnabled(
  address: string,
  planId: string,
  enabled: boolean,
): Promise<string> {
  const { core } = await writeContracts(address)
  const receipt = (await (await core.setPlanEnabled(chainPlanId(planId), enabled)).wait()) as ContractTransactionReceipt
  return receipt.hash
}

export type TimelineKind =
  | 'opened'
  | 'topped-up'
  | 'partial'
  | 'settled'
  | 'early'
  | 'renewed'
  | 'deferred'
  | 'claimed'

export interface TimelineEntry {
  kind: TimelineKind
  at: number
  blockNumber: number
  amount?: number
  interest?: number
  penalty?: number
  newPrincipal?: number
  newDepositId?: number
  remainingPrincipal?: number
}

/** Every event that touched one certificate, oldest first. */
export async function loadDepositTimeline(depositId: string): Promise<TimelineEntry[]> {
  const config = requireConfig()
  const { core, provider } = await readContracts()
  const id = BigInt(depositId.replace('chain-', ''))
  const from = config.deploymentBlock

  // Indexed topic filters behave differently across wallet RPCs, so read every
  // event in the deployment range and keep the ones that belong to this id.
  const [opened, topped, partial, withdrawn, renewed, deferred, claimed] = await Promise.all([
    core.queryFilter(core.filters.DepositOpened(), from, 'latest'),
    core.queryFilter(core.filters.DepositToppedUp(), from, 'latest'),
    core.queryFilter(core.filters.PartialEarlyWithdrawn(), from, 'latest'),
    core.queryFilter(core.filters.Withdrawn(), from, 'latest'),
    core.queryFilter(core.filters.Renewed(), from, 'latest'),
    core.queryFilter(core.filters.InterestDeferred(), from, 'latest'),
    core.queryFilter(core.filters.InterestClaimed(), from, 'latest'),
  ])
  const mine = (log: unknown, field = 'depositId') => {
    const args = argsOf(log, field)
    return args && args[field] === id ? args : null
  }

  const entries: TimelineEntry[] = []
  const add = (log: { blockNumber: number }, entry: Omit<TimelineEntry, 'blockNumber'>) =>
    entries.push({ ...entry, blockNumber: log.blockNumber })

  for (const log of opened) {
    const args = mine(log)
    if (args) add(log, { kind: 'opened', at: 0, amount: asNumber(args.principal as bigint) })
  }
  for (const log of topped) {
    const args = mine(log)
    if (args) {
      add(log, {
        kind: 'topped-up',
        at: 0,
        amount: asNumber(args.amount as bigint),
        newPrincipal: asNumber(args.newPrincipal as bigint),
        interest: asNumber(args.interestAdded as bigint),
      })
    }
  }
  for (const log of partial) {
    const args = mine(log)
    if (args) {
      add(log, {
        kind: 'partial',
        at: 0,
        amount: asNumber(args.amount as bigint),
        penalty: asNumber(args.penalty as bigint),
        remainingPrincipal: asNumber(args.remainingPrincipal as bigint),
      })
    }
  }
  for (const log of withdrawn) {
    const args = mine(log)
    if (args) {
      add(log, {
        kind: args.isEarly ? 'early' : 'settled',
        at: 0,
        amount: asNumber(args.principal as bigint),
        interest: asNumber(args.interest as bigint),
      })
    }
  }
  for (const log of renewed) {
    const args = mine(log, 'oldDepositId')
    if (args) {
      add(log, {
        kind: 'renewed',
        at: 0,
        newDepositId: Number(args.newDepositId as bigint),
        newPrincipal: asNumber(args.newPrincipal as bigint),
      })
    }
  }
  for (const log of deferred) {
    const args = mine(log)
    if (args) add(log, { kind: 'deferred', at: 0, amount: asNumber(args.amount as bigint) })
  }
  for (const log of claimed) {
    const args = mine(log)
    if (args) add(log, { kind: 'claimed', at: 0, amount: asNumber(args.amount as bigint) })
  }

  entries.sort((a, b) => a.blockNumber - b.blockNumber)

  const blocks = new Map<number, number>()
  await Promise.all(
    [...new Set(entries.map((entry) => entry.blockNumber))].map(async (blockNumber) => {
      const block = await provider.getBlock(blockNumber)
      blocks.set(blockNumber, (block?.timestamp ?? 0) * 1_000)
    }),
  )

  return entries.map((entry) => ({ ...entry, at: blocks.get(entry.blockNumber) ?? 0 }))
}
