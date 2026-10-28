import { IconContext } from '@phosphor-icons/react'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { ToastProvider } from './components/Toast'
import { LangProvider } from './i18n/LangProvider'
import { useI18n } from './i18n/lang'
import { BankProvider } from './state/BankProvider'
import { ThemeProvider } from './state/ThemeProvider'

const PlansPage = lazy(() =>
  import('./pages/PlansPage').then((module) => ({ default: module.PlansPage })),
)
const DepositsPage = lazy(() =>
  import('./pages/DepositsPage').then((module) => ({ default: module.DepositsPage })),
)

export default function App() {
  return (
    <BrowserRouter>
      <LangProvider>
        <ThemeProvider>
          <IconContext.Provider value={{ weight: 'light', size: 20 }}>
            <ToastProvider>
              <BankProvider>
                <AppShell>
                  <Suspense fallback={<PageFallback />}>
                    <Routes>
                      <Route path="/" element={<PlansPage />} />
                      <Route path="/so-tiet-kiem" element={<DepositsPage />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                </AppShell>
              </BankProvider>
            </ToastProvider>
          </IconContext.Provider>
        </ThemeProvider>
      </LangProvider>
    </BrowserRouter>
  )
}

function PageFallback() {
  const { t } = useI18n()
  return (
    <div className="panel min-h-[420px] animate-pulse p-6" role="status" aria-live="polite">
      <span className="sr-only">{t.common.processing}</span>
      <div className="h-3 w-24 rounded-full bg-paper-deep" />
      <div className="mt-7 h-10 w-2/3 rounded-full bg-paper-deep" />
      <div className="mt-4 h-4 w-1/2 rounded-full bg-paper-deep" />
    </div>
  )
}

function NotFound() {
  const { t } = useI18n()
  return (
    <div className="panel flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-3 text-4xl font-medium tracking-[-0.05em]">{t.notFound.title}</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">{t.notFound.description}</p>
      <Link to="/" className="btn btn-primary mt-6">
        {t.notFound.back}
      </Link>
    </div>
  )
}
