import type { EthereumProvider } from '../types'
import { contractConfig } from './config'

export interface WalletInfo {
  uuid: string
  name: string
  icon: string
  rdns: string
  provider: EthereumProvider
}

interface ProviderAnnouncement {
  info: Omit<WalletInfo, 'provider'>
  provider: EthereumProvider
}

const STORAGE_KEY = 'tich-wallet-v1'
const ANNOUNCE_EVENT = 'eip6963:announceProvider'
const REQUEST_EVENT = 'eip6963:requestProvider'
const FALLBACK_CHAIN_ID = 11155111
const SEPOLIA_RPC_URL =
  import.meta.env.VITE_SEPOLIA_RPC_URL?.trim() || 'https://ethereum-sepolia-rpc.publicnode.com'

let active: WalletInfo | null = null
let listening = false
const known = new Map<string, WalletInfo>()

function rememberDiscovery(): void {
  if (listening) return
  listening = true
  window.addEventListener(ANNOUNCE_EVENT, (event) => {
    const detail = (event as CustomEvent<ProviderAnnouncement>).detail
    if (detail?.info?.rdns && detail.provider && !known.has(detail.info.rdns)) {
      known.set(detail.info.rdns, { ...detail.info, provider: detail.provider })
    }
  })
  window.dispatchEvent(new Event(REQUEST_EVENT))
}

export function targetChainId(): number {
  return contractConfig?.chainId ?? FALLBACK_CHAIN_ID
}

function legacyWallet(): WalletInfo | null {
  const provider = window.ethereum
  if (!provider) return null
  const isMetaMask = Boolean((provider as { isMetaMask?: boolean }).isMetaMask)
  return {
    uuid: 'legacy-injected',
    name: isMetaMask ? 'MetaMask' : 'Browser wallet',
    icon: '',
    rdns: 'legacy-injected',
    provider,
  }
}

export async function discoverWallets(timeoutMs = 300): Promise<WalletInfo[]> {
  rememberDiscovery()
  const seen = new Map(known)
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<ProviderAnnouncement>).detail
    if (detail?.info?.rdns && detail.provider) {
      seen.set(detail.info.rdns, { ...detail.info, provider: detail.provider })
      known.set(detail.info.rdns, { ...detail.info, provider: detail.provider })
    }
  }
  window.addEventListener(ANNOUNCE_EVENT, listener)
  window.dispatchEvent(new Event(REQUEST_EVENT))
  await new Promise((resolve) => window.setTimeout(resolve, timeoutMs))
  window.removeEventListener(ANNOUNCE_EVENT, listener)
  const wallets = [...seen.values()].sort((left, right) => {
    if (left.rdns === 'io.metamask') return -1
    if (right.rdns === 'io.metamask') return 1
    return left.name.localeCompare(right.name)
  })
  if (wallets.length > 0) return wallets
  const legacy = legacyWallet()
  return legacy ? [legacy] : []
}

export function getActiveWallet(): WalletInfo | null {
  return active
}

export function providerFor(): EthereumProvider {
  const provider = active?.provider ?? window.ethereum
  if (!provider) throw new Error('NO_WALLET')
  return provider
}

export function selectWallet(wallet: WalletInfo): void {
  active = wallet
  try {
    window.localStorage.setItem(STORAGE_KEY, wallet.rdns)
  } catch {
    // Storage can be unavailable; selection still works for this session.
  }
}

export function clearWallet(): void {
  active = null
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore storage failures on disconnect.
  }
}

function errorCode(cause: unknown): number | undefined {
  if (!cause || typeof cause !== 'object') return undefined
  const record = cause as { code?: unknown; data?: { originalError?: { code?: unknown } } }
  const code = record.code ?? record.data?.originalError?.code
  return typeof code === 'number' ? code : undefined
}

async function addSepolia(wallet: WalletInfo): Promise<void> {
  const chainId = `0x${targetChainId().toString(16)}`
  await wallet.provider.request({
    method: 'wallet_addEthereumChain',
    params: [
      {
        chainId,
        chainName: 'Sepolia',
        nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: [SEPOLIA_RPC_URL],
        blockExplorerUrls: ['https://sepolia.etherscan.io'],
      },
    ],
  })
}

export async function ensureTargetNetwork(): Promise<void> {
  const wallet = active ?? legacyWallet()
  if (!wallet) throw new Error('NO_WALLET')
  const chainId = `0x${targetChainId().toString(16)}`
  const current = (await wallet.provider.request({ method: 'eth_chainId' })) as string
  if (current?.toLowerCase() === chainId.toLowerCase()) return
  try {
    await wallet.provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId }],
    })
  } catch (cause) {
    if (errorCode(cause) !== 4902) throw cause
    await addSepolia(wallet)
  }
}

export async function connectInjectedWallet(wallet: WalletInfo): Promise<string> {
  selectWallet(wallet)
  await ensureTargetNetwork()
  const accounts = (await wallet.provider.request({ method: 'eth_requestAccounts' })) as string[]
  const address = accounts?.[0]
  if (!address) throw new Error('NO_ACCOUNT')
  return address
}

export async function restoreInjectedWallet(): Promise<{ wallet: WalletInfo; address: string } | null> {
  let saved: string | null = null
  try {
    saved = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (!saved) return null
  const wallets = await discoverWallets(200)
  const wallet = wallets.find((candidate) => candidate.rdns === saved)
  if (!wallet) return null
  try {
    const accounts = (await wallet.provider.request({ method: 'eth_accounts' })) as string[]
    const address = accounts?.[0]
    if (!address) return null
    active = wallet
    return { wallet, address }
  } catch {
    return null
  }
}

export function subscribeWalletEvents(handlers: {
  onAccountsChanged: (address: string | null) => void
  onChainChanged: (chainId: string | null) => void
}): () => void {
  const provider = active?.provider ?? window.ethereum
  if (!provider?.on || !provider.removeListener) return () => {}
  const accountsListener = (...args: unknown[]) => {
    const next = Array.isArray(args[0]) ? args[0][0] : undefined
    handlers.onAccountsChanged(typeof next === 'string' && next ? next : null)
  }
  const chainListener = (...args: unknown[]) => {
    const next = typeof args[0] === 'string' ? args[0] : null
    handlers.onChainChanged(next)
  }
  provider.on('accountsChanged', accountsListener)
  provider.on('chainChanged', chainListener)
  return () => {
    provider.removeListener?.('accountsChanged', accountsListener)
    provider.removeListener?.('chainChanged', chainListener)
  }
}
