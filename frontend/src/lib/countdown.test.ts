import { describe, expect, it } from 'vitest'
import { en, vi as viMessages } from '../i18n/messages'
import { remainingLabel, remainingTime } from './countdown'

const HOUR = 3_600_000
const MINUTE = 60_000
const DAY = 24 * HOUR
const NOW = new Date('2026-01-01T00:00:00.000Z').getTime()

describe('remainingTime', () => {
  it('splits a multi-day remainder into days, hours and minutes', () => {
    expect(remainingTime(NOW, NOW + DAY + 2 * HOUR + 30 * MINUTE)).toEqual({
      totalMs: DAY + 2 * HOUR + 30 * MINUTE,
      days: 1,
      hours: 2,
      minutes: 30,
    })
  })

  it('keeps hour/minute precision below one day', () => {
    expect(remainingTime(NOW, NOW + 23 * HOUR + 59 * MINUTE + 59_000)).toEqual({
      totalMs: 23 * HOUR + 59 * MINUTE + 59_000,
      days: 0,
      hours: 23,
      minutes: 59,
    })
  })

  it('floors partial minutes instead of rounding them up', () => {
    expect(remainingTime(NOW, NOW + 30_000).minutes).toBe(0)
    expect(remainingTime(NOW, NOW + 59_999).minutes).toBe(0)
    expect(remainingTime(NOW, NOW + MINUTE).minutes).toBe(1)
  })

  it('clamps past and zero durations to zero', () => {
    expect(remainingTime(NOW, NOW)).toEqual({ totalMs: 0, days: 0, hours: 0, minutes: 0 })
    expect(remainingTime(NOW, NOW - DAY)).toEqual({ totalMs: 0, days: 0, hours: 0, minutes: 0 })
  })
})

describe('remainingLabel', () => {
  it('labels days and hours in Vietnamese', () => {
    expect(remainingLabel(remainingTime(NOW, NOW + DAY + 2 * HOUR), viMessages)).toBe(
      'Còn 1 ngày 2 giờ',
    )
    expect(remainingLabel(remainingTime(NOW, NOW + DAY), viMessages)).toBe('Còn 1 ngày')
  })

  it('labels hours and minutes below one day in Vietnamese', () => {
    expect(remainingLabel(remainingTime(NOW, NOW + 23 * HOUR + 59 * MINUTE), viMessages)).toBe(
      'Còn 23 giờ 59 phút',
    )
    expect(remainingLabel(remainingTime(NOW, NOW + 5 * HOUR), viMessages)).toBe('Còn 5 giờ')
    expect(remainingLabel(remainingTime(NOW, NOW + 30 * MINUTE), viMessages)).toBe('Còn 30 phút')
    expect(remainingLabel(remainingTime(NOW, NOW + 30_000), viMessages)).toBe('Còn dưới 1 phút')
    expect(remainingLabel(remainingTime(NOW, NOW), viMessages)).toBe('Đã đáo hạn')
  })

  it('labels the same boundaries in English', () => {
    expect(remainingLabel(remainingTime(NOW, NOW + DAY + 2 * HOUR), en)).toBe('1d 2h left')
    expect(remainingLabel(remainingTime(NOW, NOW + DAY), en)).toBe('1 day left')
    expect(remainingLabel(remainingTime(NOW, NOW + 23 * HOUR + 59 * MINUTE), en)).toBe(
      '23h 59m left',
    )
    expect(remainingLabel(remainingTime(NOW, NOW + 30 * MINUTE), en)).toBe('30 min left')
    expect(remainingLabel(remainingTime(NOW, NOW + 30_000), en)).toBe('Less than a minute left')
    expect(remainingLabel(remainingTime(NOW, NOW), en)).toBe('Matured')
  })

  it('documents that minutes are dropped once a full day remains', () => {
    const value = remainingTime(NOW, NOW + DAY + 59 * MINUTE)
    expect(value).toMatchObject({ days: 1, hours: 0, minutes: 59 })
    expect(remainingLabel(value, viMessages)).toBe('Còn 1 ngày')
  })
})
