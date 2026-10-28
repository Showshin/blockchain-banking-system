import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const dialogStack: symbol[] = []
let bodyLockCount = 0
let bodyOverflowBeforeLock = ''

function lockBodyScroll() {
  if (bodyLockCount === 0) bodyOverflowBeforeLock = document.body.style.overflow
  bodyLockCount += 1
  document.body.style.overflow = 'hidden'
}

function unlockBodyScroll() {
  bodyLockCount = Math.max(0, bodyLockCount - 1)
  if (bodyLockCount === 0) document.body.style.overflow = bodyOverflowBeforeLock
}

function isVisible(element: HTMLElement): boolean {
  return element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true'
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible)
}

export function useDialogFocus<T extends HTMLElement = HTMLElement>({
  open,
  onClose,
  canClose = true,
  initialFocus,
}: {
  open: boolean
  onClose: () => void
  canClose?: boolean
  initialFocus?: () => HTMLElement | null
}) {
  const dialogRef = useRef<T>(null)
  const closeRef = useRef(onClose)
  const canCloseRef = useRef(canClose)
  const initialFocusRef = useRef(initialFocus)

  useEffect(() => {
    closeRef.current = onClose
    canCloseRef.current = canClose
    initialFocusRef.current = initialFocus
  }, [canClose, initialFocus, onClose])

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    if (!dialog) return

    const id = Symbol('dialog')
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogStack.push(id)
    lockBodyScroll()

    const focusFrame = window.requestAnimationFrame(() => {
      const preferred = initialFocusRef.current?.()
      const target =
        preferred && dialog.contains(preferred) && isVisible(preferred)
          ? preferred
          : (focusableElements(dialog)[0] ?? dialog)
      target.focus({ preventScroll: true })
    })

    const onKeyDown = (event: KeyboardEvent) => {
      if (dialogStack.at(-1) !== id) return

      if (event.key === 'Escape') {
        if (!canCloseRef.current) return
        event.preventDefault()
        event.stopImmediatePropagation()
        closeRef.current()
        return
      }

      if (event.key !== 'Tab') return
      const focusable = focusableElements(dialog)
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus({ preventScroll: true })
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      const focusIsOutside = !dialog.contains(active)

      if (event.shiftKey && (focusIsOutside || active === first || active === dialog)) {
        event.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!event.shiftKey && (focusIsOutside || active === last)) {
        event.preventDefault()
        first.focus({ preventScroll: true })
      }
    }

    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', onKeyDown, true)
      const stackIndex = dialogStack.lastIndexOf(id)
      if (stackIndex >= 0) dialogStack.splice(stackIndex, 1)
      unlockBodyScroll()

      window.requestAnimationFrame(() => {
        if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true })
      })
    }
  }, [open])

  return dialogRef
}
