import { ArrowSquareOut, ShieldCheck, Wallet } from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import { contractConfig, contractConfigError } from '../contracts/config'
import {
  connectInjectedWallet,
  discoverWallets,
  ensureTargetNetwork,
  type WalletInfo,
} from '../contracts/wallet'
import { useI18n } from '../i18n/lang'
import { formatAddress, formatUsdc } from '../lib/format'
import { networkName } from '../lib/network'
import { useBank } from '../state/bank'
import { useToast } from '../state/toast'
import { Modal, ModalClose } from './Modal'

function errorCode(cause: unknown): number | undefined {
  if (!cause || typeof cause !== 'object') return undefined
  const record = cause as { code?: unknown; data?: { originalError?: { code?: unknown } } }
  const code = record.code ?? record.data?.originalError?.code
  return typeof code === 'number' ? code : undefined
}

export function WalletDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, connectWallet, disconnectWallet, refreshChain, chainLoading, chainError, networkMismatch } = useBank()
  const { toast } = useToast()
  const { t } = useI18n()
  const copy = t.walletDialog
  const [wallets, setWallets] = useState<WalletInfo[]>([])
  const [discovering, setDiscovering] = useState<boolean>(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const scan = useCallback(async () => {
    setDiscovering(true)
    setError(null)
    try {
      setWallets(await discoverWallets())
    } finally {
      setDiscovering(false)
    }
  }, [])

  useEffect(() => {
    if (!open || state.wallet.connected) return
    const task = window.setTimeout(() => void scan(), 0)
    return () => window.clearTimeout(task)
  }, [open, scan, state.wallet.connected])

  const describeError = (cause: unknown): string => {
    if (cause instanceof Error) {
      if (cause.message === 'NO_WALLET') return copy.errorNoWallet
      if (cause.message === 'NO_ACCOUNT') return copy.errorNoAccount
      if (cause.message === 'CONFIG') return copy.errorContractConfig
      if (cause.message.startsWith('WRONG_NETWORK:')) {
        return copy.errorWrongNetwork(cause.message.slice('WRONG_NETWORK:'.length))
      }
    }
    if (errorCode(cause) === 4001) return copy.errorRejected
    const message = cause instanceof Error ? cause.message : ''
    if (/rejected|denied/i.test(message)) return copy.errorRejected
    return copy.errorConnect
  }

  const connect = async (wallet: WalletInfo) => {
    setError(null)
    setBusyId(wallet.uuid)
    try {
      if (contractConfigError || !contractConfig) throw new Error('CONFIG')
      const address = await connectInjectedWallet(wallet)
      connectWallet(address, { name: wallet.name, icon: wallet.icon, rdns: wallet.rdns })
      toast({
        title: copy.toastWalletTitle(wallet.name),
        message: copy.toastWalletMessage,
        tone: 'success',
      })
      onClose()
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setBusyId(null)
    }
  }

  const switchChain = async () => {
    setError(null)
    setBusyId('network')
    try {
      await ensureTargetNetwork()
      await refreshChain()
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setBusyId(null)
    }
  }

  const connectedIcon = state.wallet.icon || ''
  const connectedName = state.wallet.name || copy.unknownWallet
  const chainId = contractConfig?.chainId ?? 11155111
  const showDiscovery = discovering && wallets.length === 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      label={copy.title}
      size="sm"
      closeDisabled={busyId !== null}
    >
      <div className="p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-medium tracking-[-0.04em]">{copy.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{copy.description}</p>
          </div>
          <ModalClose onClose={onClose} disabled={busyId !== null} />
        </div>

        {state.wallet.connected ? (
          <div className="mt-7">
            <div className="rounded-[18px] border border-line bg-paper/70 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {connectedIcon ? (
                    <img src={connectedIcon} alt="" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-paper">
                      <Wallet size={18} weight="light" className="text-muted" />
                    </span>
                  )}
                  <div>
                    <p className="text-sm font-medium">{formatAddress(state.wallet.address)}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {connectedName} · USDC {formatUsdc(state.wallet.balance)}
                    </p>
                  </div>
                </div>
                <span className="connected-dot h-2 w-2 rounded-full" aria-label={copy.connected} />
              </div>
            </div>
            {chainLoading || chainError || (networkMismatch && error) ? (
              <p className="mt-3 text-[11px] leading-relaxed text-muted" role="status">
                {chainLoading
                  ? copy.chainLoading
                  : networkMismatch && error
                    ? error
                    : chainError}
              </p>
            ) : null}
            {chainError ? (
              <button
                type="button"
                className="btn btn-secondary mt-3 w-full"
                onClick={switchChain}
                disabled={busyId !== null}
              >
                {busyId === 'network' ? copy.walletWaiting : copy.switchNetwork}
              </button>
            ) : null}
            <p className="mt-4 flex gap-2 text-xs leading-relaxed text-muted">
              <ShieldCheck size={16} weight="light" className="mt-0.5 shrink-0 text-accent" />
              {copy.noteContract}
            </p>
            <button
              type="button"
              className="btn btn-secondary mt-5 w-full"
              onClick={() => {
                disconnectWallet()
              }}
            >
              {copy.disconnect}
            </button>
          </div>
        ) : (
          <div className="mt-7 space-y-3">
            {showDiscovery ? (
              <div
                className="flex min-h-[220px] flex-col items-center justify-center"
                role="status"
                aria-live="polite"
              >
                <span
                  className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-ink"
                  aria-hidden="true"
                />
                <span className="sr-only">{copy.discovering}</span>
              </div>
            ) : (
              <>
                {wallets.map((wallet) => (
                  <button
                    key={wallet.uuid}
                    type="button"
                    className="wallet-option"
                    title={copy.walletDescription(networkName(chainId)) + ' · Chain ID ' + chainId}
                    onClick={() => void connect(wallet)}
                    disabled={busyId !== null}
                  >
                    {wallet.icon ? (
                      <img src={wallet.icon} alt="" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
                    ) : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-paper">
                        <Wallet size={18} weight="light" className="text-muted" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-base font-medium">{wallet.name}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {busyId === wallet.uuid
                          ? copy.walletWaiting
                          : copy.walletDescription(networkName(chainId))}
                      </span>
                    </span>
                    <ArrowSquareOut size={17} weight="light" className="text-muted" />
                  </button>
                ))}

                {!discovering && wallets.length === 0 ? (
                  <div className="rounded-xl border border-line px-3.5 py-3 text-xs leading-relaxed text-muted">
                    {copy.errorNoWallet}
                    <button type="button" className="ml-2 underline" onClick={() => void scan()}>
                      {copy.retry}
                    </button>
                  </div>
                ) : null}

                {error && !networkMismatch ? (
                  <p role="alert" className="alert-danger rounded-xl border px-3.5 py-3 text-xs leading-relaxed">
                    {error}
                  </p>
                ) : null}

                <p className="flex gap-2 pt-2 text-xs leading-relaxed text-muted">
                  <ShieldCheck size={16} weight="light" className="mt-0.5 shrink-0 text-accent" />
                  {copy.noteContractSetup}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
