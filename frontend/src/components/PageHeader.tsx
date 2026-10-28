import type { ReactNode } from 'react'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="page-header mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="page-header-copy max-w-2xl">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-header-title mt-2 text-[clamp(2rem,4vw,3.4rem)] font-medium leading-[0.98] tracking-[-0.055em] text-ink">
          {title}
        </h1>
        {description ? (
          <p className="page-header-description mt-3 max-w-xl text-sm leading-relaxed text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="page-header-actions flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  )
}
