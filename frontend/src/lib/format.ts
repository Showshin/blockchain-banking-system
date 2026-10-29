import type { Lang } from '../i18n/messages'

const usdcFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const dateFormatters: Record<Lang, Intl.DateTimeFormat> = {
  vi: new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }),
  en: new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }),
}

const dateTimeFormatters: Record<Lang, Intl.DateTimeFormat> = {
  vi: new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }),
  en: new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }),
}

export function formatUsdc(value: number, compact = false): string {
  if (compact && Math.abs(value) >= 10_000) return compactFormatter.format(value)
  return usdcFormatter.format(value)
}

export function formatBps(bps: number): string {
  const value = (bps / 100).toFixed(2)
  return (value.endsWith('.00') ? value.slice(0, -3) : value) + '%'
}

export function formatDate(value: string | number | Date, lang: Lang = 'vi'): string {
  return dateFormatters[lang].format(new Date(value))
}

export function formatDateTime(value: string | number | Date, lang: Lang = 'vi'): string {
  return dateTimeFormatters[lang].format(new Date(value))
}

export function formatAddress(address: string | null): string {
  if (!address) return '—'
  return address.slice(0, 6) + '…' + address.slice(-4)
}

export function parseAmount(value: string): number {
  const cleaned = value.replace(/\s/g, '')
  if (!cleaned) return 0

  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  let normalized = cleaned

  if (lastComma >= 0 && lastDot >= 0) {
    // Both separators exist: the last one is the decimal separator.
    normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '')
  } else if (lastComma >= 0 || lastDot >= 0) {
    const separator = lastComma >= 0 ? ',' : '.'
    const parts = cleaned.split(separator)
    if (parts.length > 2) {
      // Multiple identical separators can only be thousands grouping.
      normalized = parts.join('')
    } else {
      const [whole, fraction = ''] = parts
      const looksGrouped =
        fraction.length === 3 &&
        whole.length > 0 &&
        whole.length <= 3 &&
        whole !== '0' &&
        !whole.startsWith('0')
      normalized = looksGrouped ? whole + fraction : `${whole}.${fraction}`
    }
  }

  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}
