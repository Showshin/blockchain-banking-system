import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { LangContext } from './lang'
import { messages, type Lang } from './messages'

const LANG_KEY = 'tich-lang-v1'

function loadLang(): Lang {
  try {
    return window.localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'vi'
  } catch {
    return 'vi'
  }
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(loadLang)

  useEffect(() => {
    try {
      window.localStorage.setItem(LANG_KEY, lang)
    } catch {
      // Language still works for this session when storage is unavailable.
    }
    document.documentElement.lang = lang
    document.title = messages[lang].meta.title
  }, [lang])

  const value = useMemo(() => ({ lang, setLang, t: messages[lang] }), [lang])

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}
