/**
 * What the browser says about the visitor, with no 3D dependencies, so the
 * workspace grid can share it without loading the scene kit.
 */
import { useSyncExternalStore } from 'react'

const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
export const prefersReducedMotion = () => !!motionQuery?.matches
/** The preference when the page loaded. Scenes size their tweens and idle loops from it once. */
export const reducedMotion = prefersReducedMotion()
export function useReducedMotion() {
  return useSyncExternalStore(
    (l) => {
      motionQuery?.addEventListener('change', l)
      return () => motionQuery?.removeEventListener('change', l)
    },
    prefersReducedMotion,
    () => false,
  )
}

export const coarsePointer = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

/** Inputs that take no typed text, such as a checkbox, still let shortcuts through. */
const untypedInputs = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'])
/** True when a key press on `target` is typing: a text input, a textarea, a select or editable content. */
export function isTyping(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement) return !untypedInputs.has(target.type)
  return target instanceof HTMLElement && (target.isContentEditable || target.matches('textarea, select'))
}
