import { createContext, useContext } from 'react'
import type { Lang, Messages } from './messages'

export interface LangContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: Messages
}

export const LangContext = createContext<LangContextValue | null>(null)

export function useI18n(): LangContextValue {
  const context = useContext(LangContext)
  if (!context) throw new Error('useI18n must be used inside LangProvider')
  return context
}

export type { Lang } from './messages'
