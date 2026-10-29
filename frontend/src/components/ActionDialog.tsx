import { ArrowRight, WarningCircle } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { useI18n } from '../i18n/lang'
import { isClaimable, isMatured, maturityFor, penaltyFor, topUpInterestFor } from '../lib/bank'
import { nowDate } from '../lib/clock'
import { formatBps, formatDate, formatUsdc, parseAmount } from '../lib/format'
import { useBank } from '../state/bank'
import { useToast } from '../state/toast'
import { useUi } from '../state/ui'
import { Modal, ModalClose } from './Modal'

export type ActionMode = 'withdraw' | 'renew' | 'topup' | 'claim'

export function ActionDialog({
  depositId,
  mode,
  onClose,
}: {
  depositId: string | null
  mode: ActionMode
  onClose: () => void
}) {
  const {
    state,
    withdrawDeposit,
    withdrawDepositPartial,
    renewDeposit,
    topUpDeposit,
    claimInterest,
  } = useBank()
  const { openWallet } = useUi()
  const { toast } = useToast()
  const { t, lang } = useI18n()
  const copy = t.actionDialog
  const deposit = state.deposits.find((candidate) => candidate.id === depositId)
  const plan = deposit ? state.plans.find((candidate) => candidate.id === deposit.planId) : undefined
  const matured = deposit ? isMatured(deposit) : false
  const claimable = deposit ? isClaimable(deposit) : false
  const interest = deposit?.interestAtMaturity ?? 0
  const pendingInterest = deposit?.pendingInterest ?? 0
  const enabledPlans = useMemo(() => state.plans.filter((plan) => plan.enabled), [state.plans])
  const [newPlanId, setNewPlanId] = useState(() => {
    const samePlan = state.plans.find((plan) => plan.id === deposit?.planId && plan.enabled)
    return samePlan?.id ?? enabledPlans[0]?.id ?? ''
  })
  const [withdrawAmount, setWithdrawAmount] = useState(() =>
    deposit ? String(deposit.principal) : '',
  )
  const [topUpAmount, setTopUpAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmInput, setConfirmInput] = useState('')
  const selectedPlanId = enabledPlans.some((plan) => plan.id === newPlanId)
    ? newPlanId
    : (enabledPlans[0]?.id ?? '')
  const renewPlan = state.plans.find((plan) => plan.id === selectedPlanId)
  const newPrincipal = deposit ? deposit.principal + interest : 0
  const newMaturity =
    renewPlan && deposit ? maturityFor(nowDate(), renewPlan.tenorDays) : nowDate().toISOString()

  if (!deposit) return null

  const isEarly = mode === 'withdraw' && !matured
  const parsedWithdraw = parseAmount(withdrawAmount)
  const minimumRemaining = plan?.minDeposit ?? 0
  const requestedAmount = matured
    ? deposit.principal
    : Math.min(Math.max(parsedWithdraw, 0), deposit.principal)
  const remainingPrincipal = matured ? 0 : Math.max(0, deposit.principal - requestedAmount)
  const isPartial = isEarly && parsedWithdraw > 0 && parsedWithdraw < deposit.principal
  const invalidAmount = isEarly && (parsedWithdraw <= 0 || parsedWithdraw > deposit.principal)
  const amountError =
    !isEarly
      ? null
      : invalidAmount
        ? copy.invalidPartial
        : isPartial && remainingPrincipal < minimumRemaining
          ? copy.belowMinimum(formatUsdc(minimumRemaining))
          : null
  const penalty = amountError || matured ? 0 : penaltyFor(requestedAmount, deposit.penaltyBpsAtOpen)

  const topUpRoom = plan ? Math.max(0, plan.maxDeposit - deposit.principal) : 0
  const maxTopUp = Math.min(topUpRoom, state.wallet.balance)
  const parsedTopUp = parseAmount(topUpAmount)
  const topUpError =
    mode !== 'topup'
      ? null
      : topUpRoom <= 0
        ? copy.topUpNoRoom
        : parsedTopUp <= 0
          ? copy.invalidTopUp
          : parsedTopUp > topUpRoom
            ? copy.topUpAboveMaximum(formatUsdc(plan?.maxDeposit ?? 0))
            : parsedTopUp > state.wallet.balance
              ? t.errors.insufficientBalance
              : null
  const topUpInterest =
    mode === 'topup' && parsedTopUp > 0 ? topUpInterestFor(deposit, parsedTopUp) : 0
  const showTopUpError = Boolean(topUpError) && topUpAmount.trim() !== ''

  const maturedDeferred = mode === 'withdraw' && matured && state.vault.balance < interest
  const renewShortfall = mode === 'renew' && matured && state.vault.balance < interest
  const claimBlocked = mode === 'claim' && state.vault.balance < pendingInterest
  const payout = amountError
    ? 0
    : matured
      ? deposit.principal + (maturedDeferred ? 0 : interest)
      : requestedAmount - penalty
  const heroValue =
    mode === 'withdraw'
      ? payout
      : mode === 'renew'
        ? newPrincipal
        : mode === 'topup'
          ? deposit.principal + Math.max(0, parsedTopUp)
          : pendingInterest
  const heroLabel =
    mode === 'withdraw'
      ? copy.payout
      : mode === 'renew'
        ? copy.newPrincipal
        : mode === 'topup'
          ? copy.newPrincipalAfterTopUp
          : copy.claimAmount

  const expectedText = copy.confirmPhrase(deposit.certificateNo)
  const isConfirmationMatched = !isEarly || confirmInput.trim().toLowerCase() === expectedText.toLowerCase()

  const handleConfirm = async () => {
    if (!state.wallet.connected) {
      openWallet()
      return
    }
    if (amountError) {
      setError(amountError)
      return
    }
    if (topUpError) {
      setError(topUpError)
      return
    }
    setError(null)
    setBusy(true)
    await new Promise((resolve) => window.setTimeout(resolve, 620))
    try {
      if (mode === 'withdraw') {
        const receipt = isPartial
          ? await withdrawDepositPartial(deposit.id, parsedWithdraw)
          : await withdrawDeposit(deposit.id)
        if (receipt.kind === 'mature' && receipt.pendingInterest > 0) {
          toast({
            title: copy.toastDeferred,
            message: copy.toastDeferredMessage(
              formatUsdc(receipt.payout),
              formatUsdc(receipt.pendingInterest),
            ),
            tone: 'info',
          })
        } else {
          toast({
            title:
              receipt.kind === 'partial'
                ? copy.toastPartial
                : receipt.kind === 'mature'
                  ? copy.toastSettled
                  : copy.toastEarly,
            message:
              receipt.kind === 'partial'
                ? copy.toastPartialMessage(
                    formatUsdc(receipt.payout),
                    formatUsdc(receipt.remainingPrincipal),
                  )
                : copy.toastReceived(
                    formatUsdc(receipt.payout),
                    receipt.penalty > 0 ? formatUsdc(receipt.penalty) : '',
                  ),
            tone: receipt.kind === 'mature' ? 'success' : 'info',
          })
        }
      } else if (mode === 'renew') {
        if (!renewPlan) throw new Error(t.errors.renewPlanUnavailable)
        const created = await renewDeposit(deposit.id, renewPlan.id)
        toast({
          title: copy.toastRenewed(created.certificateNo),
          message: copy.toastRenewedMessage(
            formatUsdc(created.principal),
            formatDate(created.maturityAt, lang),
          ),
          tone: 'success',
        })
      } else if (mode === 'topup') {
        const receipt = await topUpDeposit(deposit.id, parsedTopUp)
        toast({
          title: copy.toastToppedUp,
          message: copy.toastToppedUpMessage(
            formatUsdc(receipt.amount),
            formatUsdc(receipt.newPrincipal),
            formatUsdc(receipt.interestAdded),
          ),
          tone: 'success',
        })
      } else {
        if (!claimable) throw new Error(copy.claimUnavailable)
        const receipt = await claimInterest(deposit.id)
        toast({
          title: copy.toastClaimed,
          message: copy.toastClaimedMessage(formatUsdc(receipt.interest)),
          tone: 'success',
        })
      }
      onClose()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : copy.genericError
      setError(message)
      toast({ title: copy.toastErrorTitle, message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const title =
    mode === 'withdraw'
      ? matured
        ? copy.titleSettle
        : copy.titleEarly
      : mode === 'renew'
        ? copy.titleRenew
        : mode === 'topup'
          ? copy.titleTopUp
          : copy.titleClaim
  const description =
    mode === 'withdraw'
      ? matured
        ? copy.descMature
        : copy.descEarly
      : mode === 'renew'
        ? copy.descRenew
        : mode === 'topup'
          ? copy.descTopUp
          : copy.descClaim
  const confirmLabel =
    mode === 'withdraw'
      ? matured
        ? copy.confirmSettle
        : copy.confirmEarly
      : mode === 'renew'
        ? copy.confirmRenew
        : mode === 'topup'
          ? copy.confirmTopUp
          : copy.confirmClaim
  const canConfirm =
    !busy &&
    isConfirmationMatched &&
    !amountError &&
    !topUpError &&
    (mode === 'withdraw'
      ? true
      : mode === 'renew'
        ? matured && Boolean(renewPlan?.enabled) && !renewShortfall
        : mode === 'topup'
          ? topUpRoom > 0
          : claimable && !claimBlocked)

  return (
    <Modal
      open={Boolean(depositId)}
      onClose={() => {
        setConfirmInput('')
        onClose()
      }}
      label={title}
      size="sm"
      closeDisabled={busy}
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">{copy.eyebrow(deposit.certificateNo)}</p>
            <h2 className="mt-1.5 text-[22px] font-medium leading-tight tracking-[-0.045em]">
              {title}
            </h2>
          </div>
          <ModalClose onClose={onClose} disabled={busy} />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">{description}</p>

        <div className="mt-4 rounded-[18px] bg-contrast p-4 text-on-contrast">
          <div className="flex items-end justify-between gap-4 max-[359px]:flex-col max-[359px]:items-stretch">
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-[0.18em] text-on-contrast/55">
                {heroLabel}
              </p>
              <p className="mt-1.5 whitespace-nowrap text-[clamp(1.5rem,4.8vw,1.9rem)] font-medium leading-none tracking-[-0.055em] tabular-nums">
                {formatUsdc(heroValue)}
                <span className="ml-1.5 text-[11px] font-normal tracking-normal text-on-contrast/60">
                  USDC
                </span>
              </p>
            </div>
            <dl className="min-w-0 max-w-[40%] shrink-0 space-y-2 border-on-contrast/10 text-right text-[11px] min-[360px]:border-l min-[360px]:pl-4 max-[359px]:grid max-[359px]:max-w-none max-[359px]:grid-cols-2 max-[359px]:gap-4 max-[359px]:space-y-0 max-[359px]:text-left">
              {mode === 'withdraw' ? (
                matured ? (
                  maturedDeferred ? (
                    <SummaryMetric
                      label={copy.claimPending}
                      value={formatUsdc(interest) + ' USDC'}
                      tone="positive"
                    />
                  ) : (
                    <SummaryMetric
                      label={copy.interestReceived}
                      value={formatUsdc(interest) + ' USDC'}
                      tone={interest > 0 ? 'positive' : 'neutral'}
                    />
                  )
                ) : (
                  <>
                    <SummaryMetric label={copy.noInterest} value="0.00 USDC" />
                    <SummaryMetric
                      label={copy.earlyPenalty}
                      value={formatUsdc(penalty) + ' USDC'}
                      tone={penalty > 0 ? 'negative' : 'neutral'}
                    />
                  </>
                )
              ) : mode === 'renew' ? (
                <>
                  <SummaryMetric
                    label={copy.interestAdded}
                    value={formatUsdc(interest) + ' USDC'}
                    tone={interest > 0 ? 'positive' : 'neutral'}
                  />
                  <SummaryMetric
                    label={copy.newMaturity}
                    value={formatDate(newMaturity, lang)}
                  />
                </>
              ) : mode === 'topup' ? (
                <>
                  <SummaryMetric
                    label={copy.interestIncrease}
                    value={formatUsdc(topUpInterest) + ' USDC'}
                    tone={topUpInterest > 0 ? 'positive' : 'neutral'}
                  />
                  <SummaryMetric
                    label={copy.unchangedMaturity}
                    value={formatDate(deposit.maturityAt, lang)}
                  />
                </>
              ) : (
                <>
                  <SummaryMetric
                    label={t.deposits.certificate.plan}
                    value={plan ? plan.name[lang] : t.common.noPlan}
                  />
                  <SummaryMetric
                    label={copy.unchangedMaturity}
                    value={formatDate(deposit.maturityAt, lang)}
                  />
                </>
              )}
            </dl>
          </div>
        </div>

        {isEarly ? (
          <div className="mt-4">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="withdraw-amount" className="label">
                {copy.withdrawAmount}
              </label>
              <button
                type="button"
                className="text-[10px] font-medium text-accent underline decoration-accent/30 underline-offset-4 transition hover:decoration-accent disabled:opacity-40"
                onClick={() => {
                  setWithdrawAmount(String(deposit.principal))
                  setError(null)
                }}
                disabled={busy}
              >
                {copy.withdrawAll}
              </button>
            </div>
            <div className="relative mt-1.5">
              <input
                id="withdraw-amount"
                value={withdrawAmount}
                onChange={(event) => {
                  setWithdrawAmount(event.target.value)
                  setError(null)
                }}
                inputMode="decimal"
                autoComplete="off"
                className="amount-input"
                aria-invalid={Boolean(amountError)}
                aria-describedby={
                  amountError
                    ? 'withdraw-amount-hint withdraw-amount-error'
                    : 'withdraw-amount-hint'
                }
                disabled={busy}
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-medium tracking-[0.12em] text-muted">
                USDC
              </span>
            </div>
            <div
              id="withdraw-amount-hint"
              className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 text-[10.5px] text-muted"
            >
              <span>
                {copy.remainingPrincipal}{' '}
                <span className="tabular-nums text-ink">{formatUsdc(remainingPrincipal)}</span>{' '}
                USDC
              </span>
              <span>
                {copy.minimumRemaining}{' '}
                <span className="tabular-nums text-ink">{formatUsdc(minimumRemaining)}</span>{' '}
                USDC
              </span>
            </div>
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted">{copy.partialHint}</p>
            {amountError ? (
              <p
                id="withdraw-amount-error"
                role="alert"
                className="alert-danger mt-2 rounded-xl border px-3.5 py-2.5 text-[11px] leading-relaxed"
              >
                {amountError}
              </p>
            ) : null}
          </div>
        ) : null}

        {mode === 'topup' ? (
          <div className="mt-4">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="topup-amount" className="label">
                {copy.topUpAmount}
              </label>
              <button
                type="button"
                className="text-[10px] font-medium text-accent underline decoration-accent/30 underline-offset-4 transition hover:decoration-accent disabled:opacity-40"
                onClick={() => {
                  setTopUpAmount(String(maxTopUp))
                  setError(null)
                }}
                disabled={busy || maxTopUp <= 0}
              >
                {copy.topUpAll}
              </button>
            </div>
            <div className="relative mt-1.5">
              <input
                id="topup-amount"
                value={topUpAmount}
                onChange={(event) => {
                  setTopUpAmount(event.target.value)
                  setError(null)
                }}
                inputMode="decimal"
                autoComplete="off"
                className="amount-input"
                aria-invalid={showTopUpError}
                aria-describedby={
                  showTopUpError ? 'topup-amount-hint topup-amount-error' : 'topup-amount-hint'
                }
                disabled={busy}
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-medium tracking-[0.12em] text-muted">
                USDC
              </span>
            </div>
            <div
              id="topup-amount-hint"
              className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 text-[10.5px] text-muted"
            >
              <span>{copy.topUpRoom(formatUsdc(topUpRoom))}</span>
              <span>{copy.walletBalance(formatUsdc(state.wallet.balance))}</span>
            </div>
            {showTopUpError ? (
              <p
                id="topup-amount-error"
                role="alert"
                className="alert-danger mt-2 rounded-xl border px-3.5 py-2.5 text-[11px] leading-relaxed"
              >
                {topUpError}
              </p>
            ) : null}
          </div>
        ) : null}

        {mode === 'claim' ? (
          <div className="mt-4 rounded-[16px] border border-line bg-surface px-4 py-3">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted">{copy.claimPending}</span>
              <span className="font-medium tabular-nums">{formatUsdc(pendingInterest)} USDC</span>
            </div>
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted">{copy.descClaim}</p>
          </div>
        ) : null}

        {isEarly ? (
          <div className="mt-4 border-t border-line pt-4">
            <label
              htmlFor="confirm-cancel"
              className="block text-[11px] leading-relaxed text-muted"
            >
              {copy.confirmPrompt}{' '}
              <span className="text-muted">“</span>
              <span className="mono select-all text-[10.5px] font-medium text-ink">
                {expectedText}
              </span>
              <span className="text-muted">”</span>
            </label>
            <input
              id="confirm-cancel"
              type="text"
              value={confirmInput}
              onChange={(event) => setConfirmInput(event.target.value)}
              placeholder={expectedText}
              className="input mt-2 w-full font-mono text-[11px]"
              autoComplete="off"
              disabled={busy}
            />
          </div>
        ) : null}

        {mode === 'renew' ? (
          <div className="mt-4">
            <label htmlFor="renew-plan" className="label">
              {copy.choosePlan}
            </label>
            <select
              id="renew-plan"
              value={selectedPlanId}
              onChange={(event) => setNewPlanId(event.target.value)}
              className="input mt-1.5"
              disabled={busy}
            >
              {enabledPlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {copy.planOption(
                    plan.name[lang],
                    formatBps(plan.aprBps),
                    String(plan.tenorDays),
                  )}
                </option>
              ))}
            </select>
            {renewPlan ? (
              <dl className="mt-3 grid grid-cols-3 gap-3">
                <Meta label={copy.lockedAprNew} value={formatBps(renewPlan.aprBps)} />
                <Meta label={copy.term} value={t.common.days(renewPlan.tenorDays)} />
                <Meta label={copy.earlyPenaltyNew} value={formatBps(renewPlan.penaltyBps)} />
              </dl>
            ) : null}
            {enabledPlans.length === 0 ? (
              <p className="alert-warning mt-3 flex gap-2 rounded-xl border px-3.5 py-2.5 text-[11px] leading-relaxed">
                <WarningCircle size={15} weight="light" className="mt-0.5 shrink-0" />
                {copy.noRenewPlans}
              </p>
            ) : null}
          </div>
        ) : null}

        {!matured && mode === 'renew' ? (
          <p role="status" className="alert-warning mt-3 flex gap-2 rounded-xl border px-3.5 py-2.5 text-[11px] leading-relaxed">
            <WarningCircle size={15} weight="light" className="mt-0.5 shrink-0" />
            {copy.notMatured}
          </p>
        ) : null}

        {maturedDeferred ? (
          <p role="status" className="alert-warning mt-3 flex gap-2 rounded-xl border px-3.5 py-2.5 text-[11px] leading-relaxed">
            <WarningCircle size={15} weight="light" className="mt-0.5 shrink-0" />
            {copy.maturedVaultDeferred}
          </p>
        ) : null}

        {renewShortfall ? (
          <p role="alert" className="alert-danger mt-3 flex gap-2 rounded-xl border px-3.5 py-2.5 text-[11px] leading-relaxed">
            <WarningCircle size={15} weight="light" className="mt-0.5 shrink-0" />
            {copy.vaultShortfall}
          </p>
        ) : null}

        {claimBlocked ? (
          <p role="alert" className="alert-danger mt-3 flex gap-2 rounded-xl border px-3.5 py-2.5 text-[11px] leading-relaxed">
            <WarningCircle size={15} weight="light" className="mt-0.5 shrink-0" />
            {copy.claimUnavailable}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="alert-danger mt-3 rounded-xl border px-3.5 py-2.5 text-[11px] leading-relaxed">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            className="btn btn-secondary shrink-0 px-4"
            onClick={onClose}
            disabled={busy}
          >
            {t.common.back}
          </button>
          <button
            type="button"
            className="btn btn-primary min-w-0 flex-1"
            onClick={() => void handleConfirm()}
            disabled={!canConfirm}
          >
            {busy ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border border-on-inverse/40 border-t-on-inverse" />
                {t.common.processing}
              </>
            ) : !state.wallet.connected ? (
              <>
                {t.common.connectWallet}
                <span className="btn-icon">
                  <ArrowRight size={15} />
                </span>
              </>
            ) : (
              <>
                {confirmLabel}
                <span className="btn-icon">
                  <ArrowRight size={15} />
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function SummaryMetric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'positive' | 'negative' | 'neutral'
}) {
  const valueTone =
    tone === 'positive'
      ? 'text-positive-on-contrast'
      : tone === 'negative'
        ? 'text-negative-on-contrast'
        : 'text-on-contrast/90'

  return (
    <div>
      <dt className="text-[8.5px] uppercase leading-none tracking-[0.16em] text-on-contrast/55">
        {label}
      </dt>
      <dd className={`mt-1 tabular-nums ${valueTone}`}>{value}</dd>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[8.5px] uppercase leading-none tracking-[0.16em] text-muted">{label}</dt>
      <dd className="mt-1.5 truncate text-[11px] font-medium tabular-nums text-ink">{value}</dd>
    </div>
  )
}
