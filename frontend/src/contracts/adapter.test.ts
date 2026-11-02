import { AbiCoder, id as keccakId } from 'ethers'
import { describe, expect, it, vi } from 'vitest'

/**
 * Regression guard for the "Contract data could not be loaded" failure.
 *
 * The snapshot used to read the whole deployment range with a single
 * `eth_getLogs`. Every provider caps that span (Infura 10,000 blocks) or prunes
 * old logs outright, so once the chain advanced far enough the read threw and
 * the whole page fell back to the generic chain error. These tests run the real
 * adapter against a fake node that enforces both limits, and assert the snapshot
 * still resolves.
 */

const CORE = '0x10E9eDb55C0cD100F67DEc8b558649e66B263c79'
const VAULT = '0x1c5533537118320021b5795473cb2552d11Bf9B5'
const USDC = '0x460193B776F34D63413d358203516CA44d78ecfE'
const WALLET = '0xE19750FC95F44bE27E4ec44F2779d2C38ba6F731'
const OTHER = '0x00000000000000000000000000000000000000AA'

const HEAD = 50_000
const DEPLOY_BLOCK = 10_000
/** Infura rejects one call that spans more than this many blocks. */
const MAX_LOG_SPAN = 10_000

const abi = AbiCoder.defaultAbiCoder()
const selector = (signature: string) => keccakId(signature).slice(0, 10)

type DepositFixture = {
  owner: string
  planId: bigint
  principal: bigint
  aprBpsAtOpen: bigint
  penaltyBpsAtOpen: bigint
  tenorDays: bigint
  openedAt: bigint
  maturityAt: bigint
  status: bigint
  principalSeconds: bigint
  interest: bigint
  pending: bigint
}

const deposits = new Map<bigint, DepositFixture>([
  [
    1n,
    {
      owner: WALLET,
      planId: 1n,
      principal: 500_000_000n,
      aprBpsAtOpen: 225n,
      penaltyBpsAtOpen: 400n,
      tenorDays: 90n,
      openedAt: 1_793_592_792n,
      maturityAt: 1_801_368_792n,
      status: 1n,
      principalSeconds: 3_888_000_000_000_000n,
      interest: 2_773_972n,
      pending: 0n,
    },
  ],
  [
    2n,
    {
      owner: OTHER,
      planId: 1n,
      principal: 900_000_000n,
      aprBpsAtOpen: 225n,
      penaltyBpsAtOpen: 400n,
      tenorDays: 90n,
      openedAt: 1_793_592_792n,
      maturityAt: 1_801_368_792n,
      status: 1n,
      principalSeconds: 6_998_400_000_000_000n,
      interest: 4_993_150n,
      pending: 0n,
    },
  ],
])

const PLAN_MANAGER_ROLE = keccakId('PLAN_MANAGER_ROLE')
const DEFAULT_ADMIN_ROLE = '0x' + '00'.repeat(32)
const PAUSER_ROLE = keccakId('PAUSER_ROLE')

function fail(message: string): never {
  throw Object.assign(new Error(message), { code: -32602 })
}

/**
 * Minimal EIP-1193 node: answers the calls the snapshot makes and rejects
 * `eth_getLogs` the way a real provider does — too wide a span, or a block the
 * node has already pruned.
 */
function createNode(options: { prunedBefore: number }) {
  const stats = { getLogsCalls: 0, rejectedSpan: 0, rejectedPruned: 0 }

  const ethCall = (to: string, data: string): string => {
    const target = to.toLowerCase()
    const sig = data.slice(0, 10)

    if (target === CORE.toLowerCase()) {
      if (sig === selector('nextPlanId()')) return abi.encode(['uint256'], [2n])
      if (sig === selector('nextDepositId()')) return abi.encode(['uint256'], [3n])
      if (sig === selector('plans(uint256)')) {
        return abi.encode(
          ['uint32', 'uint16', 'uint256', 'uint256', 'uint16', 'bool'],
          [90n, 225n, 100_000_000n, 0n, 400n, true],
        )
      }
      if (sig === selector('ownerOf(uint256)')) {
        const tokenId = BigInt('0x' + data.slice(10))
        const deposit = deposits.get(tokenId)
        if (!deposit) fail('ERC721NonexistentToken')
        return abi.encode(['address'], [deposit.owner])
      }
      if (sig === selector('deposits(uint256)')) {
        const tokenId = BigInt('0x' + data.slice(10))
        const deposit = deposits.get(tokenId)
        if (!deposit) fail('unknown deposit')
        return abi.encode(
          ['uint256', 'uint256', 'uint16', 'uint16', 'uint32', 'uint64', 'uint64', 'uint8', 'uint256'],
          [
            deposit.planId,
            deposit.principal,
            deposit.aprBpsAtOpen,
            deposit.penaltyBpsAtOpen,
            deposit.tenorDays,
            deposit.openedAt,
            deposit.maturityAt,
            deposit.status,
            deposit.principalSeconds,
          ],
        )
      }
      if (sig === selector('interestAtMaturity(uint256)')) {
        const deposit = deposits.get(BigInt('0x' + data.slice(10)))
        if (!deposit) fail('unknown deposit')
        return abi.encode(['uint256'], [deposit.interest])
      }
      if (sig === selector('pendingInterest(uint256)')) {
        const deposit = deposits.get(BigInt('0x' + data.slice(10)))
        if (!deposit) fail('unknown deposit')
        return abi.encode(['uint256'], [deposit.pending])
      }
      if (sig === selector('DEFAULT_ADMIN_ROLE()')) return abi.encode(['bytes32'], [DEFAULT_ADMIN_ROLE])
      if (sig === selector('PLAN_MANAGER_ROLE()')) return abi.encode(['bytes32'], [PLAN_MANAGER_ROLE])
      if (sig === selector('hasRole(bytes32,address)')) return abi.encode(['bool'], [true])
    }

    if (target === VAULT.toLowerCase()) {
      if (sig === selector('reservedInterest()')) return abi.encode(['uint256'], [20_419_016_471n])
      if (sig === selector('paused()')) return abi.encode(['bool'], [false])
      if (sig === selector('core()')) return abi.encode(['address'], [CORE])
      if (sig === selector('feeReceiver()')) return abi.encode(['address'], [OTHER])
      if (sig === selector('PAUSER_ROLE()')) return abi.encode(['bytes32'], [PAUSER_ROLE])
      if (sig === selector('hasRole(bytes32,address)')) return abi.encode(['bool'], [false])
    }

    if (target === USDC.toLowerCase()) {
      if (sig === selector('balanceOf(address)')) return abi.encode(['uint256'], [3_318_870_068_493n])
    }

    fail(`unexpected call ${sig} to ${to}`)
  }

  const request = async ({ method, params }: { method: string; params?: unknown[] }) => {
    switch (method) {
      case 'eth_chainId':
        return '0xaa36a7'
      case 'eth_blockNumber':
        return '0x' + HEAD.toString(16)
      case 'eth_call': {
        const call = (params?.[0] ?? {}) as { to: string; data: string }
        return ethCall(call.to, call.data)
      }
      case 'eth_getLogs': {
        stats.getLogsCalls += 1
        const filter = (params?.[0] ?? {}) as { fromBlock: string; toBlock: string }
        const from = Number(BigInt(filter.fromBlock))
        const to = filter.toBlock === 'latest' ? HEAD : Number(BigInt(filter.toBlock))
        if (to - from + 1 > MAX_LOG_SPAN) {
          stats.rejectedSpan += 1
          fail(`query exceeds max block range ${MAX_LOG_SPAN}`)
        }
        if (from < options.prunedBefore) {
          stats.rejectedPruned += 1
          fail('pruned history unavailable')
        }
        return []
      }
      default:
        fail(`unsupported method ${method}`)
    }
  }

  return { request, stats }
}

function installNode(options: { prunedBefore: number }) {
  const node = createNode(options)
  ;(globalThis as unknown as { window: unknown }).window = { ethereum: node }
  return node
}

vi.mock('./config', () => ({
  contractConfig: {
    chainId: 11155111,
    deploymentBlock: DEPLOY_BLOCK,
    coreAddress: CORE,
    vaultAddress: VAULT,
    usdcAddress: USDC,
  },
  hasContractConfig: true,
}))

vi.mock('./wallet', () => ({
  providerFor: () => (globalThis as unknown as { window: { ethereum: unknown } }).window.ethereum,
}))

const loadSnapshot = async () => {
  const { loadChainSnapshot } = await import('./adapter')
  return loadChainSnapshot(WALLET)
}

describe('loadChainSnapshot under provider log limits', () => {
  it('loads plans and deposits when the node prunes old logs', async () => {
    const node = installNode({ prunedBefore: 40_000 })

    const snapshot = await loadSnapshot()

    expect(snapshot.plans).toHaveLength(1)
    expect(snapshot.plans[0].tenorDays).toBe(90)
    expect(snapshot.plans[0].aprBps).toBe(225)
    expect(snapshot.plans[0].uncapped).toBe(true)
    // Only certificate 1 belongs to the connected wallet.
    expect(snapshot.deposits.map((deposit) => deposit.certificateNo)).toEqual([1])
    expect(snapshot.deposits[0].principal).toBe(500)
    expect(snapshot.deposits[0].interestAtMaturity).toBeCloseTo(2.773972, 6)
    expect(snapshot.vaultReserved).toBeCloseTo(20_419.016471, 6)
    expect(snapshot.walletBalance).toBeCloseTo(3_318_870.068493, 6)

    // The point of the fix: logs are read in windows, never as one wide range.
    expect(node.stats.rejectedSpan).toBe(0)
    expect(node.stats.getLogsCalls).toBeGreaterThan(1)
    // Some windows are pruned; that must degrade, not throw.
    expect(node.stats.rejectedPruned).toBeGreaterThan(0)
  })

  it('still loads when every log window is pruned', async () => {
    const node = installNode({ prunedBefore: HEAD + 1 })

    const snapshot = await loadSnapshot()

    expect(snapshot.deposits).toHaveLength(1)
    expect(node.stats.rejectedPruned).toBeGreaterThan(0)
    // Without the Withdrawn log the settled figures are simply absent.
    expect(snapshot.deposits[0].realizedInterest).toBeUndefined()
  })

  it('surfaces a real RPC outage instead of reporting an empty bank', async () => {
    installNode({ prunedBefore: 0 })
    ;(globalThis as unknown as { window: { ethereum: { request: unknown } } }).window.ethereum.request =
      async () => fail('socket hang up')

    await expect(loadSnapshot()).rejects.toThrow()
  })
})
