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
        'status-badge inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium leading-none tracking-[0.005em] ' +
        styles[status]
      }
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {t.status[status]}
    </span>
  )
}
