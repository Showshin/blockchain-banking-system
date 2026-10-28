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

export function formatAddress(address: string | null): string {
  if (!address) return '—'
  return address.slice(0, 6) + '…' + address.slice(-4)
}

export function daysBetween(from: string | number | Date, to: string | number | Date): number {
  return Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000)
}

export function parseAmount(value: string): number {
  const normalized = value.replace(/\s/g, '').replace(/,/g, '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}
