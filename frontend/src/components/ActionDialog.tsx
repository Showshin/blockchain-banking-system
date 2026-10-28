import { ArrowRight, WarningCircle } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { useI18n } from '../i18n/lang'
import { interestFor, isMatured, maturityFor, penaltyFor } from '../lib/bank'
import { nowDate } from '../lib/clock'
import { formatBps, formatDate, formatUsdc } from '../lib/format'
import { useBank } from '../state/bank'
import { useToast } from '../state/toast'
import { useUi } from '../state/ui'
import { Modal, ModalClose } from './Modal'

type ActionMode = 'withdraw' | 'renew'

export function ActionDialog({
  depositId,
  mode,
  onClose,
}: {
  depositId: string | null
  mode: ActionMode
  onClose: () => void
}) {
  const { state, withdrawDeposit, renewDeposit } = useBank()
  const { openWallet } = useUi()
  const { toast } = useToast()
  const { t, lang } = useI18n()
  const copy = t.actionDialog
  const deposit = state.deposits.find((candidate) => candidate.id === depositId)
  const matured = deposit ? isMatured(deposit) : false
  const interest = deposit ? interestFor(deposit.principal, deposit.aprBpsAtOpen, deposit.tenorDays) : 0
  const penalty = deposit ? penaltyFor(deposit.principal, deposit.penaltyBpsAtOpen) : 0
  const payout = deposit ? (matured ? deposit.principal + interest : deposit.principal - penalty) : 0
  const enabledPlans = useMemo(() => state.plans.filter((plan) => plan.enabled), [state.plans])
  const [newPlanId, setNewPlanId] = useState(() => {
    const samePlan = state.plans.find((plan) => plan.id === deposit?.planId && plan.enabled)
    return samePlan?.id ?? enabledPlans[0]?.id ?? ''
  })
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
  const vaultShortfall = matured && state.vault.balance < interest

  if (!deposit) return null

  const isEarly = mode === 'withdraw' && !matured
  const expectedText = `Confirm cancel No.${String(deposit.certificateNo).padStart(4, '0')}`
  const isConfirmationMatched = !isEarly || confirmInput.trim().toLowerCase() === expectedText.toLowerCase()

  const handleConfirm = async () => {
    if (!state.wallet.connected) {
      openWallet()
      return
    }
    setError(null)
    setBusy(true)
    await new Promise((resolve) => window.setTimeout(resolve, 620))
    try {
      if (mode === 'withdraw') {
        const receipt = await withdrawDeposit(deposit.id)
        toast({
          title: receipt.kind === 'mature' ? copy.toastSettled : copy.toastEarly,
          message: copy.toastReceived(
            formatUsdc(receipt.payout),
            receipt.penalty > 0 ? formatUsdc(receipt.penalty) : '',
          ),
          tone: receipt.kind === 'mature' ? 'success' : 'info',
        })
      } else {
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
    mode === 'withdraw' ? (matured ? copy.titleSettle : copy.titleEarly) : copy.titleRenew
  const description =
    mode === 'withdraw' ? (matured ? copy.descMature : copy.descEarly) : copy.descRenew
  const confirmLabel =
    mode === 'withdraw'
      ? matured
        ? copy.confirmSettle
        : copy.confirmEarly
      : copy.confirmRenew
  const canConfirm =
    !busy &&
    isConfirmationMatched &&
    (mode === 'withdraw'
      ? !vaultShortfall
      : matured && Boolean(renewPlan?.enabled) && !vaultShortfall)

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
      <div className="p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">{copy.eyebrow(deposit.certificateNo)}</p>
            <h2 className="mt-2 text-2xl font-medium tracking-[-0.045em]">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
          </div>
          <ModalClose onClose={onClose} disabled={busy} />
        </div>

        <div className="mt-6 rounded-[18px] bg-contrast p-5 text-on-contrast">
          <p className="text-[10px] uppercase tracking-[0.18em] text-on-contrast/60">
            {mode === 'withdraw' ? copy.payout : copy.newPrincipal}
          </p>
          <p className="mt-2 text-[clamp(1.9rem,6vw,2.7rem)] font-medium leading-none tracking-[-0.06em] tabular-nums">
            {formatUsdc(mode === 'withdraw' ? payout : newPrincipal)}
            <span className="ml-2 text-xs font-normal tracking-normal text-on-contrast/65">USDC</span>
          </p>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-on-contrast/10 pt-4 text-xs">
            <div>
              <p className="text-[9px] uppercase tracking-[0.16em] text-on-contrast/55">
                {mode === 'withdraw' ? (matured ? copy.interestReceived : copy.noInterest) : copy.interestAdded}
              </p>
              <p className="mt-1 tabular-nums">
                {mode === 'withdraw'
                  ? matured
                    ? formatUsdc(interest)
                    : '0.00'
                  : formatUsdc(interest)}{' '}
                USDC
              </p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-[0.16em] text-on-contrast/55">
                {mode === 'withdraw' ? copy.earlyPenalty : copy.newMaturity}
              </p>
              <p className="mt-1">
                {mode === 'withdraw'
                  ? formatUsdc(matured ? 0 : penalty) + ' USDC'
                  : formatDate(newMaturity, lang)}
              </p>
            </div>
          </div>
        </div>

        {isEarly ? (
          <div className="mt-5 rounded-[14px] border border-line bg-paper/60 p-4">
            <label htmlFor="confirm-cancel" className="block text-xs font-medium text-ink">
              {lang === 'vi' ? 'Nhập dòng chữ bên dưới để xác nhận:' : 'Type the following text to confirm:'}
            </label>
            <p className="mt-1 font-mono text-[11px] font-medium text-accent select-all">
              {expectedText}
            </p>
            <input
              id="confirm-cancel"
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={expectedText}
              className="input mt-2.5 w-full text-xs font-mono"
              autoComplete="off"
              disabled={busy}
            />
          </div>
        ) : null}

        {mode === 'renew' ? (
          <div className="mt-5">
            <label htmlFor="renew-plan" className="label">
              {copy.choosePlan}
            </label>
            <select
              id="renew-plan"
              value={selectedPlanId}
              onChange={(event) => setNewPlanId(event.target.value)}
              className="input mt-2"
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
              <div className="mt-3 divide-y divide-line rounded-[14px] border border-line text-xs">
                <Row label={copy.lockedAprNew} value={formatBps(renewPlan.aprBps)} />
                <Row label={copy.term} value={t.common.days(renewPlan.tenorDays)} />
                <Row label={copy.earlyPenaltyNew} value={formatBps(renewPlan.penaltyBps)} />
              </div>
            ) : null}
            {enabledPlans.length === 0 ? (
              <p className="alert-warning mt-3 flex gap-2 rounded-xl border px-3.5 py-3 text-xs leading-relaxed">
                <WarningCircle size={16} weight="light" className="mt-0.5 shrink-0" />
                {copy.noRenewPlans}
              </p>
            ) : null}
          </div>
        ) : null}

        {!matured && mode === 'renew' ? (
          <p role="status" className="alert-warning mt-4 flex gap-2 rounded-xl border px-3.5 py-3 text-xs leading-relaxed">
            <WarningCircle size={16} weight="light" className="mt-0.5 shrink-0" />
            {copy.notMatured}
          </p>
        ) : null}

        {vaultShortfall ? (
          <p role="alert" className="alert-danger mt-4 flex gap-2 rounded-xl border px-3.5 py-3 text-xs leading-relaxed">
            <WarningCircle size={16} weight="light" className="mt-0.5 shrink-0" />
            {copy.vaultShortfall}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="alert-danger mt-4 rounded-xl border px-3.5 py-3 text-xs leading-relaxed">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn btn-secondary flex-1" onClick={onClose} disabled={busy}>
            {t.common.back}
          </button>
          <button
            type="button"
            className="btn btn-primary flex-1"
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-muted">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}
