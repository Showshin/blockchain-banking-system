import type { ReactNode } from 'react'
import { UiContext, type UiContextValue } from './ui'

export function UiProvider({
  children,
  value,
}: {
  children: ReactNode
  value: UiContextValue
}) {
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>
}
