import { createContext, useContext } from 'react'
import type { BankState, Deposit } from '../types'

export interface WithdrawReceipt {
  kind: 'early' | 'mature'
  interest: number
  penalty: number
  payout: number
}

export interface BankContextValue {
  state: BankState
  isChainMode: boolean
  chainLoading: boolean
  chainError: string | null
  openDeposit: (planId: string, amount: number) => Promise<Deposit>
  withdrawDeposit: (depositId: string) => Promise<WithdrawReceipt>
  renewDeposit: (depositId: string, newPlanId: string) => Promise<Deposit>
  connectWallet: (address: string) => void
  disconnectWallet: () => void
  refreshChain: () => Promise<void>
}

export const BankContext = createContext<BankContextValue | null>(null)

export function useBank(): BankContextValue {
  const context = useContext(BankContext)
  if (!context) throw new Error('useBank must be used inside BankProvider')
  return context
}
