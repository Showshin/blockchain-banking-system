import { useEffect, useState } from 'react'
import type { TimelineEntry, TimelineKind } from '../contracts/adapter'
import { useI18n } from '../i18n/lang'
import { formatDateTime, formatUsdc } from '../lib/format'
import { Modal, ModalClose } from './Modal'

const LABEL_KEY: Record<TimelineKind, 'opened' | 'toppedUp' | 'partial' | 'settled' | 'early' | 'renewed' | 'deferred' | 'claimed'> = {
  opened: 'opened',
  'topped-up': 'toppedUp',
  partial: 'partial',
  settled: 'settled',
  early: 'early',
  renewed: 'renewed',
  deferred: 'deferred',
  claimed: 'claimed',
}

export function DepositTimeline({
  certificateNo,
  depositId,
  onClose,
}: {
  certificateNo: number
  depositId: string
  onClose: () => void
}) {
  const { t, lang } = useI18n()
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null)
  const [failed, setFailed] = useState(false)
  const copy = t.history.timeline
  const money = (value: number) => formatUsdc(value, false, true)

  useEffect(() => {
    let alive = true
    void import('../contracts/adapter')
      .then((adapter) => adapter.loadDepositTimeline(depositId))
      .then((list) => {
        if (alive) setEntries(list)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [depositId])

  function detail(entry: TimelineEntry): string {
    switch (entry.kind) {
      case 'opened':
        return copy.principal(money(entry.amount ?? 0))
      case 'topped-up':
        return copy.added(money(entry.amount ?? 0), money(entry.newPrincipal ?? 0))
      case 'partial':
        return [
          money(entry.amount ?? 0) + ' USDC',
          copy.penalty(money(entry.penalty ?? 0)),
          copy.principal(money(entry.remainingPrincipal ?? 0)),
        ].join(' · ')
      case 'settled':
        return [copy.principal(money(entry.amount ?? 0)), copy.interest(money(entry.interest ?? 0))].join(
          ' · ',
        )
      case 'early':
        return copy.principal(money(entry.amount ?? 0))
      case 'renewed':
        return copy.renewedTo(
          String(entry.newDepositId ?? 0).padStart(4, '0'),
          money(entry.newPrincipal ?? 0),
        )
      case 'deferred':
      case 'claimed':
        return copy.interest(money(entry.amount ?? 0))
      default:
        return ''
    }
  }

  return (
    <Modal open onClose={onClose} label={copy.title(String(certificateNo).padStart(4, '0'))}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">{t.history.eyebrow}</p>
            <h2 className="mt-1.5 text-lg font-medium tracking-[-0.02em]">
              {copy.title(String(certificateNo).padStart(4, '0'))}
            </h2>
          </div>
          <ModalClose onClose={onClose} />
        </div>

        {failed ? (
          <p className="mt-5 text-xs text-negative">{copy.error}</p>
        ) : entries === null ? (
          <div
            className="mt-5 flex min-h-[180px] flex-col items-center justify-center gap-3"
            role="status"
            aria-live="polite"
          >
            <span
              className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-ink"
              aria-hidden="true"
            />
            <p className="text-xs text-muted">{copy.loading}</p>
          </div>
        ) : entries.length === 0 ? (
          <p className="mt-5 text-xs text-muted">{copy.empty}</p>
        ) : (
          <ol className="mt-5">
            {entries.map((entry, index) => (
              <li
                key={`${entry.blockNumber}-${index}`}
                className="relative pb-4 pl-5 last:pb-0"
              >
                <span
                  className="absolute left-0 top-1.5 h-2 w-2 -translate-x-1/2 rounded-full border border-ink/55 bg-surface"
                  aria-hidden="true"
                />
                {index < entries.length - 1 ? (
                  <span
                    className="absolute bottom-[-6px] left-0 top-4 w-px -translate-x-1/2 bg-ink/25"
                    aria-hidden="true"
                  />
                ) : null}
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-[12px] font-medium">{copy[LABEL_KEY[entry.kind]]}</p>
                  <p className="mono text-[10px] text-muted">{formatDateTime(entry.at, lang)}</p>
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{detail(entry)}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Modal>
  )
}
