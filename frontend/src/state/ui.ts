import { createContext, useContext } from 'react'

export interface UiContextValue {
  openWallet: () => void
  openDeposit: (planId?: string) => void
}

export const UiContext = createContext<UiContextValue | null>(null)

export function useUi(): UiContextValue {
  const context = useContext(UiContext)
  if (!context) throw new Error('useUi must be used inside UiProvider')
  return context
}
