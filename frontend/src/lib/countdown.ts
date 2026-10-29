import type { Messages } from '../i18n/messages'

export interface RemainingTime {
  totalMs: number
  days: number
  hours: number
  minutes: number
}

export function remainingTime(
  from: number | string | Date,
  to: number | string | Date,
): RemainingTime {
  const totalMs = Math.max(0, new Date(to).getTime() - new Date(from).getTime())
  const totalMinutes = Math.max(0, Math.floor(totalMs / 60_000))
  const days = Math.floor(totalMinutes / 1_440)
  const hours = Math.floor((totalMinutes % 1_440) / 60)
  const minutes = totalMinutes % 60
  return { totalMs, days, hours, minutes }
}

export function remainingLabel(value: RemainingTime, t: Messages): string {
  if (value.totalMs <= 0) return t.common.matured
  if (value.days >= 1) {
    return value.hours > 0
      ? t.common.daysHoursLeft(value.days, value.hours)
      : t.common.daysLeft(value.days)
  }
  if (value.hours >= 1) return t.common.hoursLeft(value.hours, value.minutes)
  if (value.minutes >= 1) return t.common.minutesLeft(value.minutes)
  return t.common.lessThanMinute
}
