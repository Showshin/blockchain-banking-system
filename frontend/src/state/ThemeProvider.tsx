import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ThemeContext, type Theme } from './theme'

const THEME_KEY = 'tich-theme-v1'
const initialTheme = loadTheme()

document.documentElement.dataset.theme = initialTheme

function loadTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') return stored
    return 'light'
  } catch {
    return 'light'
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme)
  const transitionTimer = useRef<number | null>(null)

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#0e100f' : '#f5f6f3')
    try {
      window.localStorage.setItem(THEME_KEY, theme)
    } catch {
      // The selected theme still applies for this session.
    }
  }, [theme])

  useEffect(
    () => () => {
      if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current)
    },
    [],
  )

  const setTheme = useCallback(
    (nextTheme: Theme) => {
      if (nextTheme === theme) return
      const root = document.documentElement
      root.classList.add('theme-switching')
      if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current)
      transitionTimer.current = window.setTimeout(() => {
        root.classList.remove('theme-switching')
        transitionTimer.current = null
      }, 260)
      setThemeState(nextTheme)
    },
    [theme],
  )

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
