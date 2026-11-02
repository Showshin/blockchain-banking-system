import { CaretRight, Check, SealCheck, Wallet, X } from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useI18n } from '../i18n/lang'
import { interestFor, maturityFor, penaltyFor } from '../lib/bank'
import { nowDate } from '../lib/clock'
import { formatBps, formatDate, formatUsdc, parseAmount } from '../lib/format'
import { useBank } from '../state/bank'
import { useToast } from '../state/toast'
import { useUi } from '../state/ui'
import type { Deposit } from '../types'
import { TxSuccess } from './TxSuccess'

const money = (value: number) => formatUsdc(value, false, true)

type Stage = 'form' | 'pending' | 'done'

export function DepositDialog({
  planId,
  onClose,
}: {
  planId: string | null
  onClose: () => void
}) {
  const { state, openDeposit } = useBank()
  const { openWallet } = useUi()
  const { toast } = useToast()
  const { t, lang } = useI18n()
  const copy = t.depositDialog
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const plan = state.plans.find((candidate) => candidate.id === planId)
  const [amount, setAmount] = useState(() => (plan ? String(plan.minDeposit) : ''))
  const [stage, setStage] = useState<Stage>('form')
  const [created, setCreated] = useState<Deposit | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ title: string; message: string } | null>(null)
  const amountInputRef = useRef<HTMLInputElement>(null)
  const doneTitleRef = useRef<HTMLHeadingElement>(null)
  const dialogRef = useDialogFocus<HTMLElement>({
    open: Boolean(planId && plan),
    onClose,
    canClose: stage !== 'pending',
    initialFocus: () => amountInputRef.current,
  })

  useEffect(() => {
    if (stage !== 'done') return
    const frame = window.requestAnimationFrame(() => {
      doneTitleRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [stage])

  const parsedAmount = parseAmount(amount)
  const interest = useMemo(
    () => (plan && parsedAmount > 0 ? interestFor(parsedAmount, plan.aprBps, plan.tenorDays) : 0),
    [plan, parsedAmount],
  )
  const penalty = useMemo(
    () => (plan && parsedAmount > 0 ? penaltyFor(parsedAmount, plan.penaltyBps) : 0),
    [plan, parsedAmount],
  )
  const maturity = plan ? maturityFor(nowDate(), plan.tenorDays) : nowDate().toISOString()
  const maxAllowed = plan ? Math.min(plan.maxDeposit, state.wallet.balance) : 0
  const meetsMinimum = Boolean(plan && parsedAmount >= plan.minDeposit)
  const meetsMaximum = Boolean(plan && parsedAmount <= plan.maxDeposit)
  const hasBalance = parsedAmount <= state.wallet.balance
  const canSubmit =
    Boolean(plan) && parsedAmount > 0 && meetsMinimum && meetsMaximum && hasBalance && stage === 'form'

  const validationMessage = !plan
    ? copy.validationPlanMissing
    : !meetsMinimum
      ? copy.validationMin(money(plan.minDeposit))
      : !meetsMaximum
        ? copy.validationMax(money(plan.maxDeposit))
        : !hasBalance
          ? copy.validationBalance
          : null
  const amountError = error ?? validationMessage

  const handleSubmit = async () => {
    if (!plan) return
    if (!state.wallet.connected) {
      openWallet()
      return
    }
    if (!canSubmit) {
      setError(validationMessage ?? copy.errorCheckAmount)
      return
    }

    setError(null)
    setStage('pending')
    await new Promise((resolve) => window.setTimeout(resolve, 720))
    try {
      const deposit = await openDeposit(plan.id, parsedAmount)
      const successTitle = copy.toastTitle(deposit.certificateNo)
      const successMessage = copy.toastMessage(
        money(deposit.principal),
        formatDate(deposit.maturityAt, lang),
      )
      setSuccess({ title: successTitle, message: successMessage })
      await new Promise((resolve) => window.setTimeout(resolve, 1100))
      setSuccess(null)
      toast({ title: successTitle, message: successMessage, tone: 'success' })
      setCreated(deposit)
      setStage('done')
    } catch (cause) {
      setStage('form')
      const message = cause instanceof Error ? cause.message : copy.errorGeneric
      setError(message)
      toast({ title: copy.toastErrorTitle, message, tone: 'error' })
    }
  }

  return (
    <AnimatePresence>
      {planId && plan ? (
        <motion.div
          className="fixed inset-0 z-[75] flex items-end justify-end sm:items-stretch"
          role="dialog"
          aria-modal="true"
          aria-label={copy.openLabel(plan.name[lang])}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-[2px]"
            onClick={() => stage !== 'pending' && onClose()}
            aria-label={t.common.close}
          />
          <motion.section
            ref={dialogRef}
            tabIndex={-1}
            className="relative z-10 flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[24px] border border-line bg-surface shadow-[0_30px_90px_-30px_rgba(8,20,16,0.45)] sm:max-h-none sm:h-full sm:max-w-[500px] sm:rounded-none sm:border-y-0 sm:border-r-0"
            initial={reduceMotion ? false : { x: 36, opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { x: 50, opacity: 0 }}
            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-5 sm:px-6">
              <div>
                <p className="eyebrow">{copy.eyebrow}</p>
                <h2 className="mt-2 text-2xl font-medium tracking-[-0.045em]">{plan.name[lang]}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="rounded-full bg-paper px-2.5 py-1">{t.common.days(plan.tenorDays)}</span>
                  <span className="rounded-full bg-paper px-2.5 py-1">
                    {formatBps(plan.aprBps)} {t.common.apr}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="icon-button"
                aria-label={t.common.close}
                disabled={stage === 'pending'}
              >
                <X size={18} weight="light" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
              {stage === 'done' && created ? (
                <div className="flex min-h-[420px] flex-col items-center justify-center text-center" aria-live="polite">
                  <motion.span
                    className="notice-success flex h-20 w-20 items-center justify-center rounded-full border"
                    initial={reduceMotion ? false : { scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 220, damping: 18 }}
                  >
                    <Check size={38} weight="light" />
                  </motion.span>
                  <p className="mt-6 eyebrow">{copy.doneEyebrow}</p>
                  <h3
                    ref={doneTitleRef}
                    tabIndex={-1}
                    className="mt-2 text-3xl font-medium tracking-[-0.05em] focus:outline-none"
                  >
                    {copy.doneTitle(created.certificateNo)}
                  </h3>
                  <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
                    {copy.doneBody(money(created.principal))}
                  </p>
                  <div className="mt-7 w-full space-y-2 text-left">
                    <SummaryRow label={copy.expectedInterest} value={money(interest) + ' USDC'} />
                    <SummaryRow label={copy.maturityDate} value={formatDate(created.maturityAt, lang)} />
                    <SummaryRow label={copy.lockedApr} value={formatBps(created.aprBpsAtOpen)} />
                  </div>
                  <div className="mt-7 flex w-full flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      className="btn btn-primary flex-1"
                      onClick={() => {
                        onClose()
                        navigate('/so-tiet-kiem')
                      }}
                    >
                      {t.common.viewDeposits}
                      <span className="btn-icon">
                        <CaretRight size={12} weight="bold" />
                      </span>
                    </button>
                    <button type="button" className="btn btn-secondary flex-1" onClick={onClose}>
                      {t.common.close}
                    </button>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    void handleSubmit()
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="deposit-amount" className="label">
                      {copy.amountLabel}
                    </label>
                    <span className="text-xs text-muted">
                      {copy.available}{' '}
                      <span className="mono text-ink">{money(state.wallet.balance)}</span> USDC
                    </span>
                  </div>
                  <div className="relative mt-2">
                    <input
                      ref={amountInputRef}
                      id="deposit-amount"
                      value={amount}
                      onChange={(event) => {
                        setAmount(event.target.value)
                        setError(null)
                      }}
                      inputMode="decimal"
                      autoComplete="off"
                      className="amount-input"
                      placeholder="0.00"
                      aria-invalid={Boolean(amountError)}
                      aria-describedby={
                        amountError
                          ? 'deposit-amount-help deposit-amount-error'
                          : 'deposit-amount-help'
                      }
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium tracking-[0.12em] text-muted">
                      USDC
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3" id="deposit-amount-help">
                    <span className="text-[11px] text-muted">
                      {plan.uncapped
                        ? copy.rangeUncapped(money(plan.minDeposit))
                        : copy.range(money(plan.minDeposit), money(plan.maxDeposit))}
                    </span>
                    <button
                      type="button"
                      className="text-[11px] font-medium text-accent underline decoration-accent/30 underline-offset-4 transition hover:decoration-accent"
                      onClick={() => setAmount(maxAllowed.toFixed(2))}
                    >
                      {copy.useMax}
                    </button>
                  </div>

                  <div className="mt-6 overflow-hidden rounded-[18px] bg-contrast text-on-contrast">
                    <div className="relative p-5">
                      <div className="certificate-lines pointer-events-none absolute inset-0 opacity-[0.14]" />
                      <div className="relative">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-on-contrast/60">
                              {copy.expectedInterest}
                            </p>
                            <p className="mt-2 text-[clamp(1.9rem,5vw,2.6rem)] font-medium leading-none tracking-[-0.06em] tabular-nums">
                              +{money(interest)}
                              <span className="ml-2 text-xs font-normal tracking-normal text-on-contrast/65">USDC</span>
                            </p>
                          </div>
                          <SealCheck size={40} weight="light" className="shrink-0 text-on-contrast/70" />
                        </div>
                        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-on-contrast/10 pt-4">
                          <div>
                            <p className="text-[9px] uppercase tracking-[0.16em] text-on-contrast/55">
                              {copy.receiveAtMaturity}
                            </p>
                            <p className="mt-1 text-sm tabular-nums">
                              {money(parsedAmount + interest)} USDC
                            </p>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase tracking-[0.16em] text-on-contrast/55">
                              {copy.maturityDate}
                            </p>
                            <p className="mt-1 text-sm">{formatDate(maturity, lang)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 divide-y divide-line rounded-[16px] border border-line">
                    <SummaryRow label={copy.term} value={t.common.days(plan.tenorDays)} />
                    <SummaryRow label={copy.lockedApr} value={formatBps(plan.aprBps)} />
                    <SummaryRow
                      label={copy.penalty}
                      value={formatBps(plan.penaltyBps) + ' · ' + money(penalty) + ' USDC'}
                    />
                  </div>

                  <p className="mt-4 flex gap-2 text-[11px] leading-relaxed text-muted">
                    <Wallet size={15} weight="light" className="mt-0.5 shrink-0 text-accent" />
                    {copy.snapshotNote}
                  </p>

                  {amountError ? (
                    <p
                      id="deposit-amount-error"
                      role="alert"
                      className="alert-danger mt-4 rounded-xl border px-3.5 py-3 text-xs leading-relaxed"
                    >
                      {amountError}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    className="btn btn-primary mt-6 w-full"
                    disabled={stage === 'pending' || (state.wallet.connected && !canSubmit)}
                  >
                    {stage === 'pending' ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border border-on-inverse/40 border-t-on-inverse" />
                        {copy.submitPending}
                      </>
                    ) : !state.wallet.connected ? (
                      <>
                        {copy.submitConnect}
                        <span className="btn-icon">
                          <CaretRight size={12} weight="bold" />
                        </span>
                      </>
                    ) : (
                      <>
                        {copy.submit}
                        <span className="btn-icon">
                          <CaretRight size={12} weight="bold" />
                        </span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
            {success ? <TxSuccess title={success.title} message={success.message} /> : null}
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-xs">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium tabular-nums text-ink">{value}</span>
    </div>
  )
}
