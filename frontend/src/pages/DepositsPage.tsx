import { ArrowClockwise, ArrowRight, Clock, SealCheck, Wallet, WarningCircle } from '@phosphor-icons/react'
import { useState, type ReactNode } from 'react'
import { ActionDialog, type ActionMode } from '../components/ActionDialog'
import { CertificateCard } from '../components/CertificateCard'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { useI18n } from '../i18n/lang'
import { isMatured, totalActivePrincipal, totalOutstandingInterest } from '../lib/bank'
import { nowDate } from '../lib/clock'
import { daysBetween, formatDate, formatUsdc } from '../lib/format'
import { useBank } from '../state/bank'
import { useUi } from '../state/ui'

type ActionState = { depositId: string; mode: ActionMode } | null

export function DepositsPage() {
  const { state, isChainMode, chainLoading, chainError, refreshChain } = useBank()
  const { openDeposit, openWallet } = useUi()
  const { t, lang } = useI18n()
  const [action, setAction] = useState<ActionState>(null)

  const deposits = state.deposits
    .filter(
      (deposit) =>
        deposit.status === 'active' || deposit.status === 'principal-withdrawn',
    )
    .sort((a, b) => b.certificateNo - a.certificateNo)
  const nextMaturity = state.deposits
    .filter((deposit) => deposit.status === 'active' && !isMatured(deposit))
    .map((deposit) => new Date(deposit.maturityAt).getTime())
    .sort((a, b) => a - b)[0]

  return (
    <>
      <PageHeader
        eyebrow={t.deposits.eyebrow}
        title={t.deposits.title}
        description={t.deposits.description}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => openDeposit()}>
            {t.common.openDeposit}
            <span className="btn-icon">
              <ArrowRight size={15} weight="light" />
            </span>
          </button>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <SummaryCard
          icon={<Wallet size={18} weight="light" />}
          label={t.deposits.summary.principal}
          value={formatUsdc(totalActivePrincipal(state.deposits)) + ' USDC'}
        />
        <SummaryCard
          icon={<SealCheck size={18} weight="light" />}
          label={t.deposits.summary.interest}
          value={formatUsdc(totalOutstandingInterest(state.deposits)) + ' USDC'}
        />
        <SummaryCard
          icon={<Clock size={18} weight="light" />}
          label={t.deposits.summary.next}
          value={nextMaturity ? formatDate(nextMaturity, lang) : t.deposits.summary.noDeposit}
          detail={
            nextMaturity
              ? daysBetween(nowDate(), nextMaturity) > 0
                ? t.common.daysLeft(daysBetween(nowDate(), nextMaturity))
                : t.common.today
              : undefined
          }
        />
      </div>

      {!state.wallet.connected ? (
        <div className="mb-5 flex flex-col gap-3 rounded-[16px] border border-line bg-surface px-4 py-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>{t.deposits.connectNotice}</span>
          <button type="button" className="btn btn-small btn-secondary self-start sm:self-auto" onClick={openWallet}>
            {t.common.connectWallet}
          </button>
        </div>
      ) : null}

      {isChainMode && chainLoading && deposits.length > 0 ? (
        <div className="mb-5 text-xs text-muted" role="status">
          {t.chain.loading}
        </div>
      ) : null}

      {isChainMode && chainError ? (
        <div className="alert-danger mb-5 rounded-[16px] border px-4 py-3" role="alert">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <WarningCircle size={17} weight="light" className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t.chain.errorTitle}</p>
              <p className="mt-1 text-xs leading-relaxed">{chainError}</p>
            </div>
            <button
              type="button"
              className="btn btn-small btn-secondary self-start sm:shrink-0"
              onClick={() => void refreshChain()}
            >
              <ArrowClockwise size={14} weight="light" />
              {t.chain.retry}
            </button>
          </div>
        </div>
      ) : null}

      {deposits.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {deposits.map((deposit) => (
            <CertificateCard
              key={deposit.id}
              deposit={deposit}
              plan={state.plans.find((plan) => plan.id === deposit.planId)}
              onWithdraw={(selected) => setAction({ depositId: selected.id, mode: 'withdraw' })}
              onRenew={(selected) => setAction({ depositId: selected.id, mode: 'renew' })}
              onTopUp={(selected) => setAction({ depositId: selected.id, mode: 'topup' })}
              onClaim={(selected) => setAction({ depositId: selected.id, mode: 'claim' })}
            />
          ))}
        </div>
      ) : isChainMode && chainLoading ? (
        <div className="panel min-h-[260px] animate-pulse p-6" role="status" aria-live="polite">
          <span className="sr-only">{t.chain.loading}</span>
          <div className="h-3 w-28 rounded-full bg-paper-deep" />
          <div className="mt-7 h-10 w-2/3 rounded-full bg-paper-deep" />
          <div className="mt-4 h-4 w-1/2 rounded-full bg-paper-deep" />
        </div>
      ) : (
        <EmptyState
          title={t.deposits.empty.title}
          description={t.deposits.empty.description}
          action={
            <button type="button" className="btn btn-primary" onClick={() => openDeposit()}>
              {t.common.openDeposit}
            </button>
          }
        />
      )}

      <p className="mt-5 max-w-3xl text-[11px] leading-relaxed text-muted">{t.deposits.nftNote}</p>

      <ActionDialog
        key={action ? action.depositId + '-' + action.mode : 'closed'}
        depositId={action?.depositId ?? null}
        mode={action?.mode ?? 'withdraw'}
        onClose={() => setAction(null)}
      />
    </>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="rounded-[20px] border border-line bg-surface px-4 py-4">
      <div className="flex items-center gap-2 text-muted">
        <span className="text-accent">{icon}</span>
        <span className="text-[10px] uppercase tracking-[0.14em]">{label}</span>
      </div>
      <p className="mt-2 text-lg font-medium tracking-[-0.03em] tabular-nums">{value}</p>
      {detail ? <p className="mt-1 text-[10px] text-muted">{detail}</p> : null}
    </div>
  )
}
