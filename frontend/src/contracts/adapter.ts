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
import { MockUSDCAbi, SavingCoreAbi } from './abis'
import { contractConfig, type ContractConfig } from './config'
import { providerFor } from './wallet'

const ACTIVE = 1n
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
  }
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
  const { usdc, core } = await readContracts()
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
        const [source, owner, interest, pending] = await Promise.all([
          readDepositSource(core, id),
          core.ownerOf(id) as Promise<string>,
          core.interestAtMaturity(id) as Promise<bigint>,
          core.pendingInterest(id) as Promise<bigint>,
        ])
        // A deferred-interest certificate stays visible until its interest is
        // claimed; after that the position is fully closed.
        const visible =
          source.status === ACTIVE ||
          (source.status === PRINCIPAL_WITHDRAWN && pending > 0n)
        if (!visible || owner.toLowerCase() !== address.toLowerCase()) return null
        return toDeposit(id, source, owner, interest, pending)
      }),
    )
  ).filter((deposit): deposit is Deposit => deposit !== null)

  const [walletBalance, vaultBalance] = await Promise.all([
    usdc.balanceOf(address) as Promise<bigint>,
    usdc.balanceOf(config.vaultAddress) as Promise<bigint>,
  ])

  return {
    plans: planEntries,
    deposits: deposits.sort((a, b) => b.certificateNo - a.certificateNo),
    walletBalance: asNumber(walletBalance),
    vaultBalance: asNumber(vaultBalance),
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
