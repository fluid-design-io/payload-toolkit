/**
 * The lights-down change between themes: the scene dims with a flicker, the theme swaps in the dark at the midpoint,
 * the lights come back, and a clapperboard slate names the new scene.
 */
import { useFrame } from '@react-three/fiber'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

import { keepAnimating } from '../../../kit/busy'
import type { Mode, Power, ThemeVariant } from '../core/contract'
import { damp, reducedMotion } from '../core/three'
import { pick } from '../world/slots'
import type { Transition } from './shared'

type Run = Transition & { swapped: boolean }
type SlateText = { key: number; scene: string; label: string }

/**
 * Follows `chosen` through a transition, whatever changed it: a pick, W, a reset, a mod loading. `theme` is the one on
 * screen, which trails `chosen` until the midpoint. Mount `TransitionDriver` in the Canvas and `Slate` over it.
 */
export function useThemeTransition(themes: readonly ThemeVariant[], chosen: string, mode: Mode) {
  const [shown, setShown] = useState(chosen)
  const [slate, setSlate] = useState<SlateText | null>(null)
  const theme = pick(themes, shown)
  const look = theme.tokens[mode]
  const trRef = useRef<Run>({ t: 0, from: look, to: look, active: false, swapped: false })
  const pending = useRef(chosen)
  const powerRef = useRef<number>(1) as Power
  const overlayRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (chosen === pending.current) return
    pending.current = chosen
    const to = pick(themes, chosen)
    const s = trRef.current
    if (s.active && !s.swapped) {
      s.to = to.tokens[mode]
      return
    }
    trRef.current = { t: 0, from: look, to: to.tokens[mode], active: true, swapped: false }
    setSlate({ key: Date.now(), scene: `SCENE ${String(themes.indexOf(to) + 1).padStart(2, '0')}`, label: `${to.scene} · ${to.label.toUpperCase()}` })
  }, [chosen])
  return {
    theme,
    look,
    shown,
    trRef,
    powerRef,
    overlayRef,
    slate,
    onSwap: () => setShown(pending.current),
    onEnd: () => setSlate(null),
  }
}

export function TransitionDriver({ trRef, powerRef, overlayRef, onSwap, onEnd }: {
  trRef: RefObject<Run>
  powerRef: Power
  overlayRef: RefObject<HTMLDivElement | null>
  onSwap: () => void
  onEnd: () => void
}) {
  useFrame((_, dt) => {
    const s = trRef.current
    if (!s.active) {
      powerRef.current += (1 - powerRef.current) * damp(dt, 8)
    } else {
      s.t += Math.min(dt, 0.1) / (reducedMotion ? 0.6 : 2.1)
      const t = s.t
      const flick = () => (reducedMotion ? 1 : Math.floor(t * 5) % 2 ? 0.2 : 1)
      if (t < 0.28) powerRef.current = Math.max(0, 1 - t / 0.28) * flick()
      else if (t < 0.6) powerRef.current = 0
      else powerRef.current = Math.min(1, ((t - 0.6) / 0.32) * flick() + (t > 0.85 ? 0.3 : 0))
      if (!s.swapped && t >= 0.5) {
        s.swapped = true
        onSwap()
      }
      if (t >= 1) {
        s.active = false
        powerRef.current = 1
        onEnd()
      }
    }
    if (overlayRef.current) overlayRef.current.style.opacity = String((1 - powerRef.current) * 0.74)
    if (s.active || powerRef.current < 0.995) keepAnimating()
  })
  return null
}

/** The dimmed picture and the slate, over the canvas. */
export function Slate({ overlayRef, slate }: { overlayRef: RefObject<HTMLDivElement | null>; slate: SlateText | null }) {
  return (
    <>
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 bg-black opacity-0" />
      <AnimatePresence>
        {slate && (
          <motion.div
            key={slate.key}
            initial={{ opacity: 0, y: 30, rotate: -4 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            className="pointer-events-none absolute left-1/2 top-1/2 w-[300px] max-w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 font-mono text-white"
          >
            <motion.div
              initial={{ rotate: -22 }}
              animate={{ rotate: 0 }}
              transition={{ delay: 0.25, duration: 0.12, ease: 'easeIn' }}
              style={{ transformOrigin: '0% 100%', background: 'repeating-linear-gradient(115deg, #111 0 18px, #F4F4F4 18px 36px)' }}
              className="h-7 rounded-t-sm border border-white/80"
            />
            <div className="rounded-b-sm border border-white/80 bg-[#111] px-4 py-3">
              <div className="flex justify-between text-[10px] tracking-[0.25em] text-white/60">
                <span>FAB LINE</span>
                <span>TAKE 1</span>
              </div>
              <div className="mt-2 text-2xl tracking-[0.1em]">{slate.scene}</div>
              <div className="mt-1 text-xs tracking-[0.18em] text-white/80">{slate.label}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
