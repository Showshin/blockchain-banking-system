import { useI18n } from '../i18n/lang'

type StatusTone = 'active' | 'matured' | 'pending'

const styles: Record<StatusTone, string> = {
  active: 'status-badge-active',
  matured: 'status-badge-matured',
  pending: 'status-badge-matured',
}

export function StatusBadge({ status }: { status: StatusTone }) {
  const { t } = useI18n()
  return (
    <span
      className={
        'status-badge inline-flex min-w-[84px] items-center justify-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.11em] ' +
        styles[status]
      }
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-75" aria-hidden="true" />
      {t.status[status]}
    </span>
  )
}
