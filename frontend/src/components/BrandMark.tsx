import { useI18n } from '../i18n/lang'

export function BrandMark({
  compact = false,
  onLight = false,
}: {
  compact?: boolean
  onLight?: boolean
}) {
  const { t } = useI18n()
  return (
    <div className="flex items-center">
      <span className="brand-copy min-w-0">
        <span className={`block text-[17px] font-semibold leading-none tracking-[0.16em] ${onLight ? 'text-ink' : 'text-on-inverse'}`}>
          TÍCH
        </span>
        {!compact ? (
          <span className={`mt-1.5 hidden text-[9px] uppercase leading-none tracking-[0.28em] min-[360px]:block ${onLight ? 'text-muted' : 'text-on-inverse/45'}`}>
            {t.brand.tagline}
          </span>
        ) : null}
      </span>
    </div>
  )
}
