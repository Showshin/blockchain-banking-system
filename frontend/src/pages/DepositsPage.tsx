import { ArrowClockwise, CaretRight, Clock, SealCheck, Wallet, WarningCircle } from '@phosphor-icons/react'
import { useState } from 'react'
import { ActionDialog, type ActionMode } from '../components/ActionDialog'
import { CertificateCard } from '../components/CertificateCard'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { SummaryCard } from '../components/SummaryCard'
import { TestFundsNotice } from '../components/TestFundsNotice'
import { useNow } from '../hooks/useNow'
import { useI18n } from '../i18n/lang'
import { isMatured, totalActivePrincipal, totalOutstandingInterest } from '../lib/bank'
import { remainingLabel, remainingTime } from '../lib/countdown'
import { formatDate, formatUsdc } from '../lib/format'
import { useBank } from '../state/bank'
import type { Deposit } from '../types'
import { useUi } from '../state/ui'

type ActionState = { depositId: string; mode: ActionMode } | null

export function DepositsPage() {
  const { state, isChainMode, chainLoading, chainLoaded, chainError, networkMismatch, refreshChain } =
    useBank()
  // Only the first load blanks the page; a refresh after a transaction keeps the data on screen.
  const initialLoading = chainLoading && !chainLoaded
  const { openDeposit, openWallet } = useUi()
  const { t, lang } = useI18n()
  const [action, setAction] = useState<ActionState>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'matured' | 'claimable'>('all')
  const [planFilter, setPlanFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'maturity' | 'amountDesc' | 'amountAsc'>(
    'recent',
  )
  const now = useNow(30_000)

  const deposits = state.deposits
    .filter(
      (deposit) =>
        deposit.status === 'active' ||
        (deposit.status === 'principal-withdrawn' && deposit.pendingInterest > 0),
    )
    .sort((a, b) => b.certificateNo - a.certificateNo)
  const statusOf = (deposit: Deposit): 'running' | 'matured' | 'claimable' =>
    deposit.pendingInterest > 0 ? 'claimable' : isMatured(deposit, now) ? 'matured' : 'running'
  const plansInList = state.plans.filter((plan) =>
    deposits.some((deposit) => deposit.planId === plan.id),
  )
  const visible = deposits
    .filter((deposit) => statusFilter === 'all' || statusOf(deposit) === statusFilter)
    .filter((deposit) => planFilter === 'all' || deposit.planId === planFilter)
    .sort((left, right) => {
      if (sortBy === 'maturity') {
        return new Date(left.maturityAt).getTime() - new Date(right.maturityAt).getTime()
      }
      if (sortBy === 'amountDesc') return right.principal - left.principal
      if (sortBy === 'amountAsc') return left.principal - right.principal
      if (sortBy === 'oldest') return left.certificateNo - right.certificateNo
      return right.certificateNo - left.certificateNo
    })

  const nextMaturity = state.deposits
    .filter((deposit) => deposit.status === 'active' && !isMatured(deposit, now))
    .map((deposit) => new Date(deposit.maturityAt).getTime())
    .sort((a, b) => a - b)[0]

  return (
    <>
      <PageHeader
        eyebrow={t.deposits.eyebrow}
        title={t.deposits.title}
        description={t.deposits.description}
        actions={
          networkMismatch ? undefined : (
            <button type="button" className="btn btn-primary" onClick={() => openDeposit()}>
              {t.common.openDeposit}
              <span className="btn-icon">
                <CaretRight size={12} weight="bold" />
              </span>
            </button>
          )
        }
      />

      {!networkMismatch && !initialLoading ? (
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
                ? remainingLabel(remainingTime(now, nextMaturity), t)
                : undefined
            }
          />
        </div>
      ) : null}

      <TestFundsNotice />

      {!state.wallet.connected ? (
        <div className="mb-5 flex flex-col gap-3 rounded-[16px] border border-line bg-surface px-4 py-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>{t.deposits.connectNotice}</span>
          <button type="button" className="btn btn-small btn-secondary self-start sm:self-auto" onClick={openWallet}>
            {t.common.connectWallet}
          </button>
        </div>
      ) : null}

      {isChainMode && chainError && !networkMismatch && !chainLoading ? (
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

      {!initialLoading && deposits.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t.deposits.filter.label}>
            {(['all', 'running', 'matured', 'claimable'] as const).map((value) => {
              const active = statusFilter === value
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStatusFilter(value)}
                  className={
                    'rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] transition ' +
                    (active
                      ? 'border-ink bg-inverse text-on-inverse'
                      : 'border-line text-muted hover:border-ink/30 hover:text-ink')
                  }
                >
                  {t.deposits.filter[value]}
                </button>
              )
            })}
          </div>
          <label className="ml-auto flex items-center gap-2 whitespace-nowrap text-[10px] uppercase tracking-[0.1em] text-muted">
            {t.deposits.filter.plan}
            <select
              value={planFilter}
              onChange={(event) => setPlanFilter(event.target.value)}
              className="input h-8 py-0 text-[11px] normal-case tracking-normal"
            >
              <option value="all">{t.deposits.filter.planAll}</option>
              {plansInList.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name[lang]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 whitespace-nowrap text-[10px] uppercase tracking-[0.1em] text-muted">
            {t.deposits.sort.label}
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
              className="input h-8 py-0 text-[11px] normal-case tracking-normal"
            >
              <option value="recent">{t.deposits.sort.recent}</option>
              <option value="oldest">{t.deposits.sort.oldest}</option>
              <option value="maturity">{t.deposits.sort.maturity}</option>
              <option value="amountDesc">{t.deposits.sort.amountDesc}</option>
              <option value="amountAsc">{t.deposits.sort.amountAsc}</option>
            </select>
          </label>
        </div>
      ) : null}

      {isChainMode && initialLoading ? (
        <div className="panel min-h-[260px] animate-pulse p-6" role="status" aria-live="polite">
          <span className="sr-only">{t.chain.loading}</span>
          <div className="h-3 w-28 rounded-full bg-paper-deep" />
          <div className="mt-7 h-10 w-2/3 rounded-full bg-paper-deep" />
          <div className="mt-4 h-4 w-1/2 rounded-full bg-paper-deep" />
        </div>
      ) : deposits.length > 0 ? (
        visible.length === 0 ? (
          <div className="panel flex flex-col items-center gap-3 px-5 py-10 text-center">
            <p className="text-xs text-muted">{t.deposits.filter.empty}</p>
            <button
              type="button"
              className="btn btn-small btn-secondary"
              onClick={() => {
                setStatusFilter('all')
                setPlanFilter('all')
              }}
            >
              {t.deposits.filter.clear}
            </button>
          </div>
        ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visible.map((deposit) => (
            <CertificateCard
              key={deposit.id}
              deposit={deposit}
              plan={state.plans.find((plan) => plan.id === deposit.planId)}
              now={now}
              onWithdraw={(selected) => setAction({ depositId: selected.id, mode: 'withdraw' })}
              onRenew={(selected) => setAction({ depositId: selected.id, mode: 'renew' })}
              onTopUp={(selected) => setAction({ depositId: selected.id, mode: 'topup' })}
              onClaim={(selected) => setAction({ depositId: selected.id, mode: 'claim' })}
            />
          ))}
        </div>
        )
      ) : networkMismatch ? null : (
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
