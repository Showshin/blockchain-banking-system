import { ArrowRight, Clock, Coins, ShieldCheck } from '@phosphor-icons/react'
import { useI18n } from '../i18n/lang'
import { formatBps, formatUsdc } from '../lib/format'
import type { SavingPlan } from '../types'

export function PlanCard({
  plan,
  featured = false,
  onOpen,
}: {
  plan: SavingPlan
  featured?: boolean
  onOpen: (plan: SavingPlan) => void
}) {
  const { t, lang } = useI18n()
  return (
    <article className={'plan-card ' + (featured ? 'plan-card-featured' : '') + (plan.enabled ? '' : ' opacity-55')}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={'text-[10px] uppercase tracking-[0.18em] ' + (featured ? 'text-on-contrast/55' : 'text-muted')}>
            {t.common.days(plan.tenorDays)}
          </p>
          <h3 className={'plan-title mt-2 text-xl font-medium tracking-[-0.035em] ' + (featured ? 'text-on-contrast' : 'text-ink')}>
            {plan.name[lang]}
          </h3>
        </div>
        {plan.popular ? (
          <span
            className={
              'plan-badge rounded-full border px-2.5 py-1 text-center text-[9px] font-medium uppercase tracking-[0.13em] ' +
              (featured
                ? 'border-on-contrast/15 bg-on-contrast/10 text-on-contrast/70'
                : 'plan-badge-popular')
            }
          >
            {t.plans.popular}
          </span>
        ) : !plan.enabled ? (
          <span
            className={
              'plan-badge rounded-full border px-2.5 py-1 text-center text-[9px] uppercase tracking-[0.13em] ' +
              (featured ? 'border-on-contrast/15 text-on-contrast/50' : 'border-line text-muted')
            }
          >
            {t.plans.closed}
          </span>
        ) : null}
      </div>

      <div className="mt-7 flex items-end gap-2">
        <span
          className={
            'text-[clamp(3rem,7vw,4.5rem)] font-medium leading-[0.8] tracking-[-0.08em] tabular-nums ' +
            (featured ? 'text-on-contrast' : 'text-ink')
          }
        >
          {formatBps(plan.aprBps)}
        </span>
        <span className={'mb-1 text-[10px] uppercase tracking-[0.16em] ' + (featured ? 'text-on-contrast/55' : 'text-muted')}>
          {t.common.apr}
        </span>
      </div>

      <p className={'plan-description mt-4 max-w-[36ch] text-xs leading-relaxed ' + (featured ? 'text-on-contrast/65' : 'text-muted')}>
        {plan.description[lang]}
      </p>

      <div
        className={
          'mt-6 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 text-[11px] ' +
          (featured ? 'border-on-contrast/10' : 'border-line')
        }
      >
        <span className={'flex items-center gap-1.5 ' + (featured ? 'text-on-contrast/65' : 'text-muted')}>
          <Clock size={14} weight="light" />
          {t.common.days(plan.tenorDays)}
        </span>
        <span className={'flex items-center gap-1.5 ' + (featured ? 'text-on-contrast/65' : 'text-muted')}>
          <Coins size={14} weight="light" />
          {t.plans.from(formatUsdc(plan.minDeposit, true))}
        </span>
        <span className={'flex items-center gap-1.5 ' + (featured ? 'text-on-contrast/65' : 'text-muted')}>
          <ShieldCheck size={14} weight="light" />
          {t.plans.penalty(formatBps(plan.penaltyBps))}
        </span>
        <span className={'flex items-center gap-1.5 ' + (featured ? 'text-on-contrast/65' : 'text-muted')}>
          {t.plans.max(formatUsdc(plan.maxDeposit, true))}
        </span>
      </div>

      <button
        type="button"
        className={'btn mt-6 w-full ' + (featured ? 'btn-paper' : 'btn-primary')}
        onClick={() => onOpen(plan)}
        disabled={!plan.enabled}
      >
        {plan.enabled ? t.plans.open : t.plans.unavailable}
        <span className="btn-icon">
          <ArrowRight size={15} weight="light" />
        </span>
      </button>
    </article>
  )
}
