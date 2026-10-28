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

const ACTIVE = 1n
const WITHDRAWN = 2n
const MANUAL_RENEWED = 3n
const AUTO_RENEWED = 4n

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
  nextCertificateNo: number
}

export interface WithdrawReceipt {
  kind: 'early' | 'mature'
  interest: number
  penalty: number
  payout: number
}

function requireConfig(): ContractConfig {
  if (!contractConfig) throw new Error('Contract configuration is incomplete.')
  return contractConfig
}

function requireEthereum(): NonNullable<Window['ethereum']> {
  if (!window.ethereum) throw new Error('MetaMask is not available.')
  return window.ethereum
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

function toDeposit(id: bigint, source: ChainDeposit, owner: string): Deposit {
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
  }
}

async function readDeposit(
  core: Contract,
  id: bigint,
  owner: string,
  blockTag?: number,
): Promise<Deposit> {
  // A load-balanced RPC can serve a stale latest block immediately after a
  // receipt. Read against the receipt block so the returned certificate is
  // never rendered with zeroed state.
  const source = (blockTag === undefined
    ? await core.deposits(id)
    : await core.deposits(id, { blockTag })) as ChainDeposit
  return toDeposit(id, source, owner)
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
        const [source, owner] = await Promise.all([
          core.deposits(id) as Promise<ChainDeposit>,
          core.ownerOf(id) as Promise<string>,
        ])
        if (source.status !== ACTIVE || owner.toLowerCase() !== address.toLowerCase()) return null
        return toDeposit(id, source, owner)
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
    nextCertificateNo: deposits.reduce((max, deposit) => Math.max(max, deposit.certificateNo + 1), 1),
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

  await (matured ? core.withdrawAtMaturity(id) : core.earlyWithdraw(id)).then((tx) => tx.wait())

  const interest = matured ? asNumber(interestUnits) : 0
  const penalty = matured ? 0 : asNumber(penaltyUnits)
  return {
    deposit: { ...before, status: 'withdrawn' },
    receipt: {
      kind: matured ? 'mature' : 'early',
      interest,
      penalty,
      payout: before.principal + interest - penalty,
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
