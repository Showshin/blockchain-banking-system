export type SealTier = 'bronze' | 'silver' | 'gold' | 'diamond' | 'emerald'

/**
 * Presentation-only tier for the certificate seal. It reads the tenor
 * snapshot stored on the deposit, never the current plan, so an admin edit
 * cannot change an existing certificate's tier.
 */
export function sealTierFor(tenorDays: number): SealTier {
  if (tenorDays <= 1) return 'bronze'
  if (tenorDays <= 30) return 'silver'
  if (tenorDays <= 90) return 'gold'
  if (tenorDays <= 180) return 'diamond'
  return 'emerald'
}
