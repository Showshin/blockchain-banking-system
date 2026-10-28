/** A single seam for time-dependent UI so it can be replaced with a test clock later. */
export function nowMs(): number {
  return Date.now()
}

export function nowDate(): Date {
  return new Date(nowMs())
}
