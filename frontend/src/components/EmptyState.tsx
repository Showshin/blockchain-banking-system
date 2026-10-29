import { SealCheck } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="panel flex min-h-[260px] flex-col items-center justify-center px-6 py-12 text-center">
      <SealCheck size={48} weight="light" className="text-accent" />
      <h3 className="mt-5 text-lg font-medium tracking-[-0.02em]">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
