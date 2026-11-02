import { ArrowClockwise, CaretRight, Info, WarningCircle } from '@phosphor-icons/react'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { PlanCard } from '../components/PlanCard'
import { TestFundsNotice } from '../components/TestFundsNotice'
import { useI18n } from '../i18n/lang'
import { useBank } from '../state/bank'
import { useUi } from '../state/ui'

export function PlansPage() {
  const { state, isChainMode, chainLoading, chainLoaded, chainError, networkMismatch, refreshChain } =
    useBank()
  // Keep the grid on screen when a refresh runs after a transaction.
  const initialLoading = chainLoading && !chainLoaded
  const { openDeposit, openWallet } = useUi()
  const { t } = useI18n()

  return (
    <>
      <PageHeader
        eyebrow={t.plans.eyebrow}
        title={t.plans.title}
        description={t.plans.description}
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

      <TestFundsNotice />

      {!state.wallet.connected ? (
        <EmptyState
          title={t.chain.connectTitle}
          description={t.chain.connectDescription}
          action={
            <button type="button" className="btn btn-primary" onClick={openWallet}>
              {t.common.connectWallet}
            </button>
          }
        />
      ) : isChainMode && initialLoading ? (
        <div className="panel min-h-[360px] animate-pulse p-6" role="status" aria-live="polite">
          <span className="sr-only">{t.chain.loading}</span>
          <div className="h-3 w-28 rounded-full bg-paper-deep" />
          <div className="mt-7 h-10 w-2/3 rounded-full bg-paper-deep" />
          <div className="mt-4 h-4 w-1/2 rounded-full bg-paper-deep" />
        </div>
      ) : isChainMode && chainError && !networkMismatch && !chainLoading && state.plans.length === 0 ? (
        <div className="panel px-6 py-8" role="alert">
          <WarningCircle size={22} weight="light" className="text-muted" />
          <h2 className="mt-3 text-lg font-medium">{t.chain.errorTitle}</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">{chainError}</p>
          <button type="button" className="btn btn-secondary mt-5" onClick={() => void refreshChain()}>
            <ArrowClockwise size={15} weight="light" />
            {t.chain.retry}
          </button>
        </div>
      ) : networkMismatch ? null : state.plans.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {state.plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              featured={Boolean(plan.popular)}
              onOpen={(selected) => openDeposit(selected.id)}
            />
          ))}
        </div>
      ) : (
        <div className="panel px-6 py-8 text-sm text-muted">{t.chain.emptyPlans}</div>
      )}

      <p className="mt-6 flex max-w-3xl gap-2 text-[11px] leading-relaxed text-muted">
        <Info size={15} weight="light" className="mt-0.5 shrink-0 text-accent" />
        {t.plans.note}
      </p>
    </>
  )
}
