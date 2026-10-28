import { ArrowClockwise, ArrowRight, Info, WarningCircle } from '@phosphor-icons/react'
import { PageHeader } from '../components/PageHeader'
import { PlanCard } from '../components/PlanCard'
import { useI18n } from '../i18n/lang'
import { useBank } from '../state/bank'
import { useUi } from '../state/ui'

export function PlansPage() {
  const { state, isChainMode, chainLoading, chainError, refreshChain } = useBank()
  const { openDeposit } = useUi()
  const { t } = useI18n()

  return (
    <>
      <PageHeader
        eyebrow={t.plans.eyebrow}
        title={t.plans.title}
        description={t.plans.description}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => openDeposit()}>
            {t.common.openDeposit}
            <span className="btn-icon">
              <ArrowRight size={15} weight="light" />
            </span>
          </button>
        }
      />

      {isChainMode && chainLoading && state.plans.length === 0 ? (
        <div className="panel min-h-[360px] animate-pulse p-6" role="status" aria-live="polite">
          <span className="sr-only">{t.chain.loading}</span>
          <div className="h-3 w-28 rounded-full bg-paper-deep" />
          <div className="mt-7 h-10 w-2/3 rounded-full bg-paper-deep" />
          <div className="mt-4 h-4 w-1/2 rounded-full bg-paper-deep" />
        </div>
      ) : isChainMode && chainError && state.plans.length === 0 ? (
        <div className="panel px-6 py-8" role="alert">
          <WarningCircle size={22} weight="light" className="text-muted" />
          <h2 className="mt-3 text-lg font-medium">{t.chain.errorTitle}</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">{chainError}</p>
          <button type="button" className="btn btn-secondary mt-5" onClick={() => void refreshChain()}>
            <ArrowClockwise size={15} weight="light" />
            {t.chain.retry}
          </button>
        </div>
      ) : state.plans.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
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
