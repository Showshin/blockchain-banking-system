#!/usr/bin/env node
/**
 * Pre-demo chain check.
 *
 * Runs the same read path the frontend uses (`loadChainSnapshot` in
 * `src/contracts/adapter.ts`) straight from Node, so a failure here is the same
 * failure the browser would show — but with the real reason printed instead of
 * a generic banner.
 *
 * Usage:
 *   npm run doctor
 *   npm run doctor -- --rpc https://your-rpc.example
 *   npm run doctor -- --address 0xYourWallet
 *
 * No private key is needed: everything below is a read.
 */

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Contract, JsonRpcProvider, formatUnits, getAddress } from 'ethers'

const here = dirname(fileURLToPath(import.meta.url))
const frontendDir = resolve(here, '..')
const repoDir = resolve(frontendDir, '..')

/** Mirrors LOG_WINDOW in the adapter. */
const LOG_WINDOW = 5_000
const DEFAULT_RPC = 'https://ethereum-sepolia-rpc.publicnode.com'

function parseArgs(argv) {
  const args = { rpc: null, address: null }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--rpc') args.rpc = argv[++i]
    else if (argv[i] === '--address') args.address = argv[++i]
  }
  return args
}

function readEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, '').trim()
  }
  return out
}

function loadAbi(name) {
  const path = join(repoDir, 'contracts', 'artifacts', 'contracts', `${name}.sol`, `${name}.json`)
  if (!existsSync(path)) {
    throw new Error(`Missing build artifact ${path}. Run "npm run build" in contracts/ first.`)
  }
  return JSON.parse(readFileSync(path, 'utf8')).abi
}

const results = []
function record(level, name, detail) {
  results.push({ level, name, detail })
  const tag = level === 'pass' ? 'PASS' : level === 'warn' ? 'WARN' : 'FAIL'
  console.log(`[${tag}] ${name}${detail ? ' — ' + detail : ''}`)
}

const usdc = (units) => formatUnits(units, 6)

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const env = readEnvFile(join(frontendDir, '.env.local'))

  const chainId = Number(env.VITE_CHAIN_ID || 0)
  const deployBlock = Number(env.VITE_DEPLOY_BLOCK || 0)
  const coreAddress = env.VITE_CORE_ADDRESS || ''
  const vaultAddress = env.VITE_VAULT_ADDRESS || ''
  const usdcAddress = env.VITE_USDC_ADDRESS || ''
  const rpcUrl = args.rpc || env.VITE_SEPOLIA_RPC_URL || DEFAULT_RPC

  console.log(`RPC        ${rpcUrl}`)
  console.log(`Chain      ${chainId || '(missing)'}`)
  console.log(`SavingCore ${coreAddress || '(missing)'}`)
  console.log(`Vault      ${vaultAddress || '(missing)'}`)
  console.log(`USDC       ${usdcAddress || '(missing)'}`)
  console.log(`Deploy blk ${deployBlock || '(missing)'}`)
  console.log('')

  if (!coreAddress || !vaultAddress || !usdcAddress || !chainId) {
    record('fail', 'Configuration', 'frontend/.env.local needs all three addresses and a chain ID')
    return
  }

  const provider = new JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true })

  // 1. The node must be on the configured chain.
  try {
    const network = await provider.getNetwork()
    if (Number(network.chainId) !== chainId) {
      record('fail', 'Network', `node is on chain ${network.chainId}, expected ${chainId}`)
      return
    }
    record('pass', 'Network', `chain ${chainId}`)
  } catch (cause) {
    record('fail', 'Network', cause.shortMessage || cause.message)
    return
  }

  // 2. All three contracts must have code at the configured addresses.
  for (const [name, address] of [
    ['SavingCore', coreAddress],
    ['VaultManager', vaultAddress],
    ['MockUSDC', usdcAddress],
  ]) {
    try {
      const code = await provider.getCode(address)
      if (!code || code === '0x') record('fail', `${name} code`, `no contract at ${address}`)
      else record('pass', `${name} code`, `${(code.length - 2) / 2} bytes`)
    } catch (cause) {
      record('fail', `${name} code`, cause.shortMessage || cause.message)
    }
  }

  const core = new Contract(coreAddress, loadAbi('SavingCore'), provider)
  const vault = new Contract(vaultAddress, loadAbi('VaultManager'), provider)
  const token = new Contract(usdcAddress, loadAbi('MockUSDC'), provider)

  // 3. Plans.
  let nextPlanId = 0n
  try {
    nextPlanId = await core.nextPlanId()
    const plans = await Promise.all(
      Array.from({ length: Math.max(0, Number(nextPlanId) - 1) }, (_, i) => core.plans(BigInt(i + 1))),
    )
    const enabled = plans.filter((plan) => plan.enabled).length
    record('pass', 'Plans', `${plans.length} on chain, ${enabled} enabled`)
  } catch (cause) {
    record('fail', 'Plans', cause.shortMessage || cause.message)
  }

  // 4. Deposits: enumerate by id, exactly like the adapter, never by logs.
  let depositCount = 0
  let wallet = args.address
  try {
    const nextDepositId = Number(await core.nextDepositId())
    depositCount = Math.max(0, nextDepositId - 1)
    if (!wallet && depositCount > 0) {
      wallet = await core.ownerOf(BigInt(nextDepositId - 1))
      record('pass', 'Deposits', `${depositCount} issued, defaulting to last owner ${wallet}`)
    } else {
      record('pass', 'Deposits', `${depositCount} issued`)
    }
  } catch (cause) {
    record('fail', 'Deposits', cause.shortMessage || cause.message)
  }

  if (wallet) {
    const target = getAddress(wallet)
    try {
      const ids = Array.from({ length: depositCount }, (_, i) => BigInt(i + 1))
      let owned = 0
      let settled = 0
      for (const id of ids) {
        let owner
        try {
          owner = await core.ownerOf(id)
        } catch {
          continue
        }
        if (owner.toLowerCase() !== target.toLowerCase()) continue
        owned += 1
        const deposit = await core.deposits(id)
        if (Number(deposit.status) !== 1) settled += 1
      }
      record('pass', 'Wallet deposits', `${owned} for ${target} (${settled} closed)`)
    } catch (cause) {
      record('fail', 'Wallet deposits', cause.shortMessage || cause.message)
    }
  }

  // 5. Logs. The single-shot read is what used to break the page; it is
  //    reported as information, not as a failure, because the app no longer
  //    depends on it.
  let head = 0
  try {
    head = await provider.getBlockNumber()
  } catch (cause) {
    record('fail', 'Head block', cause.shortMessage || cause.message)
    return
  }

  if (deployBlock > 0) {
    try {
      await provider.getLogs({ address: coreAddress, fromBlock: deployBlock, toBlock: head })
      record('pass', 'Logs, one shot', `${head - deployBlock} blocks served`)
    } catch (cause) {
      record(
        'warn',
        'Logs, one shot',
        `${(cause.shortMessage || cause.message).slice(0, 90)} (expected: the app no longer does this)`,
      )
    }

    let served = 0
    let failed = 0
    for (let start = deployBlock; start <= head; start += LOG_WINDOW) {
      const end = Math.min(start + LOG_WINDOW - 1, head)
      try {
        await provider.getLogs({ address: coreAddress, fromBlock: start, toBlock: end })
        served += 1
      } catch {
        failed += 1
      }
    }
    if (served === 0) {
      record('fail', 'Logs, windowed', 'no window could be served, history would be empty')
    } else if (failed > 0) {
      record(
        'warn',
        'Logs, windowed',
        `${served} windows served, ${failed} pruned (history loses early settlement details)`,
      )
    } else {
      record('pass', 'Logs, windowed', `${served} windows served`)
    }
  }

  // 6. Vault and token state the admin page reads.
  try {
    const [reserved, paused, vaultCore, feeReceiver] = await Promise.all([
      vault.reservedInterest(),
      vault.paused(),
      vault.core(),
      vault.feeReceiver(),
    ])
    record(
      'pass',
      'Vault',
      `reserved ${usdc(reserved)} USDC, paused ${paused}, core ${vaultCore}, feeReceiver ${feeReceiver}`,
    )
    if (vaultCore.toLowerCase() !== coreAddress.toLowerCase()) {
      record('fail', 'Vault wiring', `vault.core() is ${vaultCore}, config says ${coreAddress}`)
    }
  } catch (cause) {
    record('fail', 'Vault', cause.shortMessage || cause.message)
  }

  try {
    const [vaultBalance, coreBalance, supply] = await Promise.all([
      token.balanceOf(vaultAddress),
      token.balanceOf(coreAddress),
      token.totalSupply(),
    ])
    record(
      'pass',
      'Token',
      `vault ${usdc(vaultBalance)}, core ${usdc(coreBalance)}, supply ${usdc(supply)} USDC`,
    )
  } catch (cause) {
    record('fail', 'Token', cause.shortMessage || cause.message)
  }

  // 7. Test funds. The frontend offers a mint button, so simulate it here: a
  //    revert means the button would fail for the same reason.
  if (wallet) {
    try {
      const units = 10_000n * 1_000_000n
      const data =
        '0x40c10f19' + // mint(address,uint256)
        wallet.slice(2).padStart(64, '0') +
        units.toString(16).padStart(64, '0')
      await provider.call({ to: usdcAddress, data, from: wallet })
      record('pass', 'Test funds', 'mint of 10,000 USDC simulates for this wallet')
    } catch (cause) {
      record('fail', 'Test funds', cause.shortMessage || cause.message)
    }
  }

  // 8. Roles, so the admin page knows what to show.
  try {
    const [adminRole, planManagerRole, pauserRole] = await Promise.all([
      core.DEFAULT_ADMIN_ROLE(),
      core.PLAN_MANAGER_ROLE(),
      vault.PAUSER_ROLE(),
    ])
    if (wallet) {
      const [isAdmin, isPlanManager, isPauser] = await Promise.all([
        core.hasRole(adminRole, wallet),
        core.hasRole(planManagerRole, wallet),
        vault.hasRole(pauserRole, wallet),
      ])
      record(
        'pass',
        'Roles',
        `${wallet}: admin ${isAdmin}, plan manager ${isPlanManager}, pauser ${isPauser}`,
      )
    } else {
      record('pass', 'Roles', 'read role ids only')
    }
  } catch (cause) {
    record('fail', 'Roles', cause.shortMessage || cause.message)
  }
}

main()
  .then(() => {
    const failed = results.filter((entry) => entry.level === 'fail').length
    const warned = results.filter((entry) => entry.level === 'warn').length
    console.log('')
    if (failed > 0) {
      console.log(`RESULT: ${failed} failed, ${warned} warning(s). The app will show the chain error.`)
      process.exitCode = 1
    } else if (warned > 0) {
      console.log(`RESULT: all checks passed, ${warned} warning(s). The app will load.`)
    } else {
      console.log('RESULT: all checks passed. The app will load.')
    }
  })
  .catch((cause) => {
    console.error('')
    console.error('Doctor crashed:', cause)
    process.exitCode = 1
  })
