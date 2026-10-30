import {
  ArrowClockwise,
  ArrowRight,
  ArrowSquareOut,
  ClockCounterClockwise,
  Receipt,
  Wallet,
  WarningCircle,
} from '@phosphor-icons/react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DepositTimeline } from '../components/DepositTimeline'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { SummaryCard } from '../components/SummaryCard'
import { contractConfig } from '../contracts/config'
import { useI18n } from '../i18n/lang'
import {
  isSettled,
  roundUsdc,
  settledPnl,
  settlementKind,
  totalSettledPnl,
  totalSettledPrincipal,
  type SettlementKind,
} from '../lib/bank'
import { formatBps, formatDate, formatUsdc } from '../lib/format'
import { useBank } from '../state/bank'
import { useUi } from '../state/ui'

function signedUsdc(value: number): string {
  return (value >= 0 ? '+' : '−') + formatUsdc(Math.abs(value), false, true) + ' USDC'
}

export function HistoryPage() {
  const { state, isChainMode, chainLoading, chainLoaded, chainError, networkMismatch, refreshChain } =
    useBank()
  // Only the first load blanks the page; a refresh after a transaction keeps the data on screen.
  const initialLoading = chainLoading && !chainLoaded
  const { openWallet } = useUi()
  const { t, lang } = useI18n()

  const [kindFilter, setKindFilter] = useState<'all' | SettlementKind>('all')
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'pnlDesc' | 'pnlAsc'>('recent')
  const [timeline, setTimeline] = useState<{ id: string; no: number } | null>(null)

  const history = state.deposits.filter((deposit) => isSettled(deposit))
  const rows = history
    .filter((deposit) => kindFilter === 'all' || settlementKind(deposit) === kindFilter)
    .sort((a, b) => {
      if (sortBy === 'oldest') return a.certificateNo - b.certificateNo
      if (sortBy === 'recent') return b.certificateNo - a.certificateNo
      const diff = (settledPnl(a) ?? 0) - (settledPnl(b) ?? 0)
      return sortBy === 'pnlDesc' ? -diff : diff
    })
  const totalPrincipal = totalSettledPrincipal(history)
  const totalPnl = totalSettledPnl(history)
  const netReceived = roundUsdc(totalPrincipal + totalPnl)

  return (
    <>
      <PageHeader
        eyebrow={t.history.eyebrow}
        title={t.history.title}
        description={t.history.description}
      />

      {!networkMismatch && !initialLoading ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <SummaryCard
            icon={<ClockCounterClockwise size={18} weight="light" />}
            label={t.history.summary.count}
            value={String(history.length)}
          />
          <SummaryCard
            icon={<Wallet size={18} weight="light" />}
            label={t.history.summary.principal}
            value={formatUsdc(totalPrincipal, false, true) + ' USDC'}
            detail={t.history.summary.net + ' ' + formatUsdc(netReceived, false, true) + ' USDC'}
          />
          <SummaryCard
            icon={<Receipt size={18} weight="light" />}
            label={t.history.summary.pnl}
            value={signedUsdc(totalPnl)}
            tone={totalPnl >= 0 ? 'positive' : 'negative'}
          />
        </div>
      ) : null}

      {!state.wallet.connected ? (
        <div className="mb-5 flex flex-col gap-3 rounded-[16px] border border-line bg-surface px-4 py-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>{t.history.connectNotice}</span>
          <button
            type="button"
            className="btn btn-small btn-secondary self-start sm:self-auto"
            onClick={openWallet}
          >
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

      {isChainMode && initialLoading ? (
        <div className="panel min-h-[260px] animate-pulse p-6" role="status" aria-live="polite">
          <span className="sr-only">{t.chain.loading}</span>
          <div className="h-3 w-28 rounded-full bg-paper-deep" />
          <div className="mt-7 h-4 w-2/3 rounded-full bg-paper-deep" />
          <div className="mt-4 h-4 w-1/2 rounded-full bg-paper-deep" />
        </div>
      ) : history.length > 0 ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t.history.filter.label}>
              {(['all', 'early', 'matured', 'renewed', 'claimed'] as const).map((value) => {
                const active = kindFilter === value
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setKindFilter(value)}
                    className={
                      'rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] transition ' +
                      (active
                        ? 'border-ink bg-inverse text-on-inverse'
                        : 'border-line text-muted hover:border-ink/30 hover:text-ink')
                    }
                  >
                    {value === 'all' ? t.history.filter.all : t.history.kind[value]}
                  </button>
                )
              })}
            </div>
            <label className="ml-auto flex items-center gap-2 whitespace-nowrap text-[10px] uppercase tracking-[0.1em] text-muted">
              {t.history.sort.label}
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
                className="input h-8 py-0 text-[11px] normal-case tracking-normal"
              >
                <option value="recent">{t.history.sort.recent}</option>
                <option value="oldest">{t.history.sort.oldest}</option>
                <option value="pnlDesc">{t.history.sort.pnlDesc}</option>
                <option value="pnlAsc">{t.history.sort.pnlAsc}</option>
              </select>
            </label>
          </div>

          {rows.length === 0 ? (
            <div className="panel flex flex-col items-center gap-3 px-5 py-10 text-center">
              <p className="text-xs text-muted">{t.history.filter.empty}</p>
              <button
                type="button"
                className="btn btn-small btn-secondary"
                onClick={() => setKindFilter('all')}
              >
                {t.history.filter.clear}
              </button>
            </div>
          ) : (
        <div className="panel overflow-hidden">
          <div className="hidden border-b border-line/80 px-5 py-3 text-[9px] uppercase tracking-[0.14em] text-muted md:grid md:grid-cols-[1.1fr_1.4fr_1fr_0.7fr_1fr_120px] md:gap-3">
            <span>{t.history.columns.certificate}</span>
            <span>{t.history.columns.plan}</span>
            <span className="text-right">{t.history.columns.principal}</span>
            <span className="text-right">{t.history.columns.apr}</span>
            <span className="text-right">{t.history.columns.maturity}</span>
            <span className="text-right">{t.history.columns.pnl}</span>
          </div>

          {rows.map((deposit) => {
            const plan = state.plans.find((candidate) => candidate.id === deposit.planId)
            const kind = settlementKind(deposit)
            const pnl = settledPnl(deposit) ?? 0
            const positive = pnl >= 0
            const explorerHref =
              contractConfig?.chainId === 11155111
                ? 'https://sepolia.etherscan.io/nft/' +
                  contractConfig.coreAddress +
                  '/' +
                  deposit.certificateNo
                : null

            return (
              <article
                key={deposit.id}
                role="button"
                tabIndex={0}
                aria-label={t.history.timeline.open}
                onClick={() => setTimeline({ id: deposit.id, no: deposit.certificateNo })}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  setTimeline({ id: deposit.id, no: deposit.certificateNo })
                }}
                className="cursor-pointer border-b border-line/70 px-5 py-4 transition last:border-b-0 hover:bg-paper-deep/25 focus-visible:bg-paper-deep/40 focus-visible:outline-none"
              >
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-[1.1fr_1.4fr_1fr_0.7fr_1fr_120px] md:items-center md:gap-3">
                  <div className="min-w-0">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-muted md:hidden">
                      {t.history.columns.certificate}
                    </p>
                    <p className="mono mt-1 flex items-center gap-1.5 text-[11px] text-ink md:mt-0">
                      #{String(deposit.certificateNo).padStart(4, '0')}
                      {explorerHref ? (
                        <a
                          href={explorerHref}
                          target="_blank"
                          rel="noreferrer"
                          title={t.history.etherscanTitle}
                          onClick={(event) => event.stopPropagation()}
                          className="text-muted transition hover:text-ink"
                        >
                          <ArrowSquareOut size={11} weight="light" />
                        </a>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {t.history.opened} {formatDate(deposit.openedAt, lang)}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-muted md:hidden">
                      {t.history.columns.plan}
                    </p>
                    <p className="mt-1 truncate text-[11px] font-medium text-ink md:mt-0">
                      {plan ? plan.name[lang] : t.common.noPlan}
                    </p>
                  </div>

                  <div className="min-w-0 md:text-right">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-muted md:hidden">
                      {t.history.columns.principal}
                    </p>
                    <p className="mt-1 text-[11px] font-medium tabular-nums text-ink md:mt-0">
                      {formatUsdc(deposit.principal, false, true)}
                    </p>
                  </div>

                  <div className="min-w-0 md:text-right">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-muted md:hidden">
                      {t.history.columns.apr}
                    </p>
                    <p className="mt-1 text-[11px] tabular-nums text-ink md:mt-0">
                      {formatBps(deposit.aprBpsAtOpen)}
                    </p>
                  </div>

                  <div className="min-w-0 md:text-right">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-muted md:hidden">
                      {t.history.columns.maturity}
                    </p>
                    <p className="mt-1 text-[11px] tabular-nums text-ink md:mt-0">
                      {formatDate(deposit.maturityAt, lang)}
                    </p>
                  </div>

                  <div className="min-w-0 md:justify-self-end md:text-right">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-muted md:hidden">
                      {t.history.columns.pnl}
                    </p>
                    <p
                      className={
                        'mt-1 text-[11px] font-medium tabular-nums md:mt-0 ' +
                        (positive ? 'text-positive' : 'text-negative')
                      }
                    >
                      {signedUsdc(pnl)}
                    </p>
                    <p className="mt-0.5 whitespace-nowrap text-[9px] uppercase tracking-[0.1em] text-muted">
                      {kind ? t.history.kind[kind] : ''}
                    </p>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
          )}
        </>
      ) : networkMismatch ? null : (
        <EmptyState
          title={t.history.empty.title}
          description={t.history.empty.description}
          action={
            <Link to="/so-tiet-kiem" className="btn btn-primary">
              {t.history.empty.action}
              <span className="btn-icon">
                <ArrowRight size={15} weight="light" />
              </span>
            </Link>
          }
        />
      )}

      <p className="mt-5 max-w-3xl text-[11px] leading-relaxed text-muted">{t.history.note}</p>

      {timeline ? (
        <DepositTimeline
          key={timeline.id}
          depositId={timeline.id}
          certificateNo={timeline.no}
          onClose={() => setTimeline(null)}
        />
      ) : null}
    </>
  )
}
