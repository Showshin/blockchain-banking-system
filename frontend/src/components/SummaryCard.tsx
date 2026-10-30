import type { ReactNode } from 'react'

export function SummaryCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode
  label: string
  value: string
  detail?: string
  tone?: 'positive' | 'negative'
}) {
  const toneClass =
    tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : ''
  return (
    <div className="rounded-[20px] border border-line bg-surface px-4 py-4">
      <div className="flex items-center gap-2 text-muted">
        <span className="text-accent">{icon}</span>
        <span className="text-[10px] uppercase tracking-[0.14em]">{label}</span>
      </div>
      <p className={'mt-2 text-lg font-medium tracking-[-0.03em] tabular-nums ' + toneClass}>
        {value}
      </p>
      {detail ? <p className="mt-1 text-[10px] text-muted">{detail}</p> : null}
    </div>
  )
}
