import { Wallet } from '@phosphor-icons/react'
import { useState } from 'react'
import { useI18n } from '../i18n/lang'
import { formatUsdc, parseAmount } from '../lib/format'
import { useBank } from '../state/bank'
import { useToast } from '../state/toast'

/**
 * MockUSDC has no supply cap, so the amount is the visitor's choice. The only
 * ceiling here is a UI guard against a slipped keystroke; the token itself
 * accepts any value and the button can simply be pressed again.
 */
const MAX_PER_REQUEST = 1_000_000
const DEFAULT_AMOUNT = '10000'

const FAUCET_URL = 'https://sepoliafaucet.com'

/**
 * Always available to a connected wallet: a visitor who arrives empty needs the
 * token before any flow works, and a visitor who already spent theirs needs a
 * way back in without leaving the app.
 */
export function TestFundsNotice() {
  const { state, isChainMode, chainLoaded, chainError, networkMismatch, requestTestFunds } = useBank()
  const { toast } = useToast()
  const { t } = useI18n()
  const copy = t.faucet
  const [amount, setAmount] = useState(DEFAULT_AMOUNT)
  const [pending, setPending] = useState(false)

  const visible =
    isChainMode &&
    chainLoaded &&
    !chainError &&
    !networkMismatch &&
    state.wallet.connected

  if (!visible) return null

  const empty = state.wallet.balance === 0
  const parsed = parseAmount(amount)
  const tooLarge = parsed > MAX_PER_REQUEST
  const valid = parsed > 0 && !tooLarge
  const money = (value: number) => formatUsdc(value, false, true)

  async function handleRequest() {
    if (!valid) return
    setPending(true)
    try {
      await requestTestFunds(parsed)
      toast({ title: copy.successTitle, message: copy.successMessage(money(parsed)), tone: 'success' })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : copy.errorTitle
      toast({ title: copy.errorTitle, message, tone: 'error' })
    } finally {
      setPending(false)
    }
  }

  const hint = !amount.trim()
    ? null
    : parsed <= 0
      ? copy.invalidAmount
      : tooLarge
        ? copy.tooLarge(money(MAX_PER_REQUEST))
        : null

  return (
    <section className="mb-5 rounded-[16px] border border-line bg-surface px-4 py-3.5" aria-live="polite">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <Wallet size={17} weight="light" className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-ink">
              {empty ? copy.titleEmpty : copy.titleFunded}
              {!empty ? (
                <span className="ml-2 font-normal text-muted">
                  {copy.balance(formatUsdc(state.wallet.balance))}
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              {empty ? copy.descriptionEmpty : copy.descriptionFunded}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              {copy.gasNote}{' '}
              <a
                href={FAUCET_URL}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-line underline-offset-2 transition hover:text-ink"
              >
                {copy.gasLink}
              </a>
              .
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 self-start lg:shrink-0">
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="faucet-amount">
              {copy.amountLabel}
            </label>
            <input
              id="faucet-amount"
              className="input h-8 w-28 text-right text-[11px] tabular-nums"
              value={amount}
              inputMode="decimal"
              autoComplete="off"
              onChange={(event) => setAmount(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleRequest()
              }}
            />
            <span className="text-[10px] uppercase tracking-[0.1em] text-muted">USDC</span>
            <button
              type="button"
              className="btn btn-primary btn-small"
              onClick={() => void handleRequest()}
              disabled={pending || !valid}
            >
              {pending ? copy.pending : copy.action}
            </button>
          </div>
          {hint ? <p className="text-right text-[10px] text-negative">{hint}</p> : null}
        </div>
      </div>
    </section>
  )
}
