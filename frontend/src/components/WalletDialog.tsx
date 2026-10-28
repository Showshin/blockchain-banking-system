import { ArrowSquareOut, ShieldCheck } from '@phosphor-icons/react'
import { useState } from 'react'
import { contractConfig, contractConfigError } from '../contracts/config'
import { useI18n } from '../i18n/lang'
import { formatAddress, formatUsdc } from '../lib/format'
import { useBank } from '../state/bank'
import { useToast } from '../state/toast'
import { Modal, ModalClose } from './Modal'

export function WalletDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, connectWallet, disconnectWallet, chainLoading, chainError } = useBank()
  const { toast } = useToast()
  const { t } = useI18n()
  const copy = t.walletDialog
  const [busy, setBusy] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const connectMetaMask = async () => {
    setError(null)
    setBusy(true)
    try {
      if (!window.ethereum) {
        throw new Error(copy.errorNoMetaMask)
      }
      if (contractConfigError) throw new Error(copy.errorContractConfig)
      if (contractConfig) {
        const { assertConfiguredNetwork } = await import('../contracts/adapter')
        await assertConfiguredNetwork()
      }
      const accounts = (await window.ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[]
      const address = accounts?.[0]
      if (!address) throw new Error(copy.errorNoAccount)
      connectWallet(address)
      toast({ title: copy.toastMetaTitle, message: copy.toastMetaMessage, tone: 'success' })
      onClose()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : copy.errorConnect
      setError(
        message.startsWith('WRONG_NETWORK:')
          ? copy.errorWrongNetwork(message.slice('WRONG_NETWORK:'.length))
          : [copy.errorNoMetaMask, copy.errorNoAccount, copy.errorContractConfig].includes(message)
            ? message
            : copy.errorConnect,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      label={copy.title}
      size="sm"
      closeDisabled={busy}
    >
      <div className="p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-medium tracking-[-0.04em]">{copy.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{copy.description}</p>
          </div>
          <ModalClose onClose={onClose} disabled={busy} />
        </div>

        {state.wallet.connected ? (
          <div className="mt-7">
            <div className="rounded-[18px] border border-line bg-paper/70 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img src="/metamask.svg" alt="MetaMask" className="h-9 w-9 object-contain shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{formatAddress(state.wallet.address)}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {copy.metamask} · USDC{' '}
                      {formatUsdc(state.wallet.balance)}
                    </p>
                  </div>
                </div>
                <span className="connected-dot h-2 w-2 rounded-full" aria-label={copy.connected} />
              </div>
            </div>
            {chainLoading || chainError ? (
              <p className="mt-3 text-[11px] leading-relaxed text-muted" role="status">
                {chainLoading ? copy.chainLoading : chainError}
              </p>
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
                toast({ title: copy.toastDisconnect, tone: 'info' })
              }}
            >
              {copy.disconnect}
            </button>
          </div>
        ) : (
          <div className="mt-7 space-y-3">
            <button
              type="button"
              className="wallet-option"
              onClick={connectMetaMask}
              disabled={busy}
            >
              <img src="/metamask.svg" alt="MetaMask" className="h-9 w-9 object-contain shrink-0" />
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-base font-medium">{copy.metamask}</span>
                {busy ? (
                  <span className="mt-0.5 block text-xs text-muted">{copy.metamaskWaiting}</span>
                ) : null}
              </span>
              <ArrowSquareOut size={17} weight="light" className="text-muted" />
            </button>

            {error ? (
              <p role="alert" className="alert-danger rounded-xl border px-3.5 py-3 text-xs leading-relaxed">
                {error}
              </p>
            ) : null}

            <p className="flex gap-2 pt-2 text-xs leading-relaxed text-muted">
              <ShieldCheck size={16} weight="light" className="mt-0.5 shrink-0 text-accent" />
              {copy.noteContractSetup}
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}
