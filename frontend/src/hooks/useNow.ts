import { useEffect, useState } from 'react'
import { nowMs } from '../lib/clock'

/** Re-renders on a fixed interval so minute-level countdowns stay current. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(nowMs)

  useEffect(() => {
    const id = window.setInterval(() => setNow(nowMs()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])

  return now
}
