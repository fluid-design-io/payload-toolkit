/**
 * A procedural WebAudio engine for the lab: short synthesized voices, a belt
 * hum that follows the queue, one master limiter. The AudioContext is created
 * on the first `play` after a user gesture, never earlier. One mute choice in
 * localStorage `lab-sound` is shared by every variant and the shell; without a
 * choice, sound is off in embedded chrome and under reduced motion.
 */
import { useEffect, useSyncExternalStore } from 'react'

import type { Lab } from '../lab.types'
import { prefersReducedMotion } from './a11y'

export type SoundName = 'tick' | 'page' | 'pick' | 'drawer' | 'seat' | 'toss' | 'servo' | 'chirp' | 'zap' | 'copy' | 'swap' | 'error'

type Voice = { gap: number; play: (ctx: AudioContext, out: AudioNode, at: number) => void }

const KEY = 'lab-sound'
const MASTER = 0.55

function tone(ctx: AudioContext, out: AudioNode, at: number, o: { type: OscillatorType; f0: number; f1?: number; dur: number; gain: number; attack?: number }) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = o.type
  osc.frequency.setValueAtTime(o.f0, at)
  if (o.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), at + o.dur)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(o.gain, at + (o.attack ?? 0.004))
  g.gain.exponentialRampToValueAtTime(0.0001, at + o.dur)
  osc.connect(g).connect(out)
  osc.start(at)
  osc.stop(at + o.dur + 0.02)
}

let noiseBuffer: AudioBuffer | null = null
function noise(ctx: AudioContext, out: AudioNode, at: number, o: { dur: number; gain: number; hz: number; hz1?: number; q?: number; type?: BiquadFilterType }) {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate / 2, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer
  const filter = ctx.createBiquadFilter()
  filter.type = o.type ?? 'bandpass'
  filter.Q.value = o.q ?? 1.2
  filter.frequency.setValueAtTime(o.hz, at)
  if (o.hz1 !== undefined) filter.frequency.exponentialRampToValueAtTime(o.hz1, at + o.dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(o.gain, at)
  g.gain.exponentialRampToValueAtTime(0.0001, at + o.dur)
  src.connect(filter).connect(g).connect(out)
  src.start(at)
  src.stop(at + o.dur + 0.02)
}

const VOICES: Record<SoundName, Voice> = {
  tick: { gap: 40, play: (c, o, t) => tone(c, o, t, { type: 'sine', f0: 1800, dur: 0.025, gain: 0.07 }) },
  page: { gap: 80, play: (c, o, t) => { tone(c, o, t, { type: 'sine', f0: 1200, dur: 0.03, gain: 0.08 }); noise(c, o, t, { dur: 0.05, gain: 0.05, hz: 2400 }) } },
  pick: { gap: 60, play: (c, o, t) => { noise(c, o, t, { dur: 0.02, gain: 0.16, hz: 3200, q: 0.8 }); tone(c, o, t + 0.004, { type: 'sine', f0: 920, f1: 600, dur: 0.07, gain: 0.14 }) } },
  drawer: { gap: 150, play: (c, o, t) => noise(c, o, t, { dur: 0.16, gain: 0.12, hz: 320, hz1: 120, q: 0.7, type: 'lowpass' }) },
  seat: { gap: 90, play: (c, o, t) => { tone(c, o, t, { type: 'sine', f0: 170, f1: 70, dur: 0.14, gain: 0.32, attack: 0.002 }); noise(c, o, t, { dur: 0.035, gain: 0.1, hz: 700, type: 'lowpass' }) } },
  toss: { gap: 120, play: (c, o, t) => noise(c, o, t, { dur: 0.24, gain: 0.1, hz: 900, hz1: 260, q: 1.6 }) },
  servo: { gap: 140, play: (c, o, t) => tone(c, o, t, { type: 'triangle', f0: 320, f1: 480, dur: 0.09, gain: 0.05, attack: 0.02 }) },
  chirp: { gap: 90, play: (c, o, t) => tone(c, o, t, { type: 'sine', f0: 900, f1: 2400, dur: 0.08, gain: 0.07 }) },
  zap: { gap: 200, play: (c, o, t) => { tone(c, o, t, { type: 'square', f0: 2200, f1: 1400, dur: 0.045, gain: 0.05 }); noise(c, o, t, { dur: 0.07, gain: 0.09, hz: 4200, type: 'highpass' }) } },
  copy: { gap: 250, play: (c, o, t) => { tone(c, o, t, { type: 'sine', f0: 660, dur: 0.07, gain: 0.13 }); tone(c, o, t + 0.08, { type: 'sine', f0: 990, dur: 0.11, gain: 0.13 }) } },
  swap: { gap: 120, play: (c, o, t) => { tone(c, o, t, { type: 'triangle', f0: 400, f1: 520, dur: 0.1, gain: 0.09 }); noise(c, o, t, { dur: 0.03, gain: 0.08, hz: 2600 }) } },
  error: { gap: 250, play: (c, o, t) => tone(c, o, t, { type: 'square', f0: 220, f1: 180, dur: 0.12, gain: 0.05 }) },
}

type Choice = 'on' | 'off' | null
const listeners = new Set<() => void>()
const engine = {
  ctx: null as AudioContext | null,
  bus: null as GainNode | null,
  hum: null as { gain: GainNode } | null,
  humLevel: 0,
  gestured: false,
  chrome: 'full' as Lab['chrome'],
  last: new Map<SoundName, number>(),
  choice: null as Choice,
}

function readChoice(): Choice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'on' || v === 'off' ? v : null
  } catch {
    return null
  }
}
engine.choice = readChoice()

const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const defaultMuted = (chrome: Lab['chrome']) => chrome === 'embedded' || prefersReducedMotion()
export const isMuted = (chrome: Lab['chrome'] = engine.chrome) => (engine.choice ? engine.choice === 'off' : defaultMuted(chrome))

function reflect() {
  document.documentElement.dataset.sound = isMuted() ? 'off' : engine.ctx ? 'on' : 'armed'
}

export function setMuted(muted: boolean) {
  engine.choice = muted ? 'off' : 'on'
  try {
    localStorage.setItem(KEY, engine.choice)
  } catch {}
  const ctx = engine.ctx
  if (ctx && engine.bus) {
    engine.bus.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.03)
    if (muted) setTimeout(() => void (isMuted() && ctx.state === 'running' && ctx.suspend()), 200)
    else if (ctx.state === 'suspended') void ctx.resume()
  }
  reflect()
  emit()
}

function context(): AudioContext | null {
  if (engine.ctx) return engine.ctx
  if (!engine.gestured || typeof AudioContext !== 'function') return null
  const ctx = new AudioContext()
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -18
  limiter.knee.value = 6
  limiter.ratio.value = 12
  limiter.attack.value = 0.003
  limiter.release.value = 0.25
  const bus = ctx.createGain()
  bus.gain.value = MASTER
  bus.connect(limiter).connect(ctx.destination)
  engine.ctx = ctx
  engine.bus = bus
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void ctx.suspend()
    else if (!isMuted()) void ctx.resume()
  })
  reflect()
  return ctx
}

let armed = false
function arm() {
  if (armed || typeof window === 'undefined') return
  armed = true
  const onGesture = () => {
    engine.gestured = true
    if (engine.ctx?.state === 'suspended' && !isMuted()) void engine.ctx.resume()
  }
  for (const type of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(type, onGesture, { capture: true, passive: true })
  reflect()
}

/** Plays one voice, throttled per name. A no-op before the first gesture or while muted. */
export function play(name: SoundName) {
  if (isMuted()) return
  const ctx = context()
  if (!ctx || !engine.bus) return
  const now = performance.now()
  const voice = VOICES[name]
  if (now - (engine.last.get(name) ?? -1e9) < voice.gap) return
  engine.last.set(name, now)
  if (ctx.state === 'suspended') void ctx.resume()
  voice.play(ctx, engine.bus, ctx.currentTime)
}

/** The belt hum. `level` 0..1 follows how much is moving; it ramps and idles silently. */
export function hum(level: number) {
  const target = Math.min(1, Math.max(0, level))
  if (target === engine.humLevel && (target === 0 || engine.hum)) return
  engine.humLevel = target
  if (isMuted()) return
  const ctx = context()
  if (!ctx || !engine.bus) return
  if (!engine.hum) {
    const gain = ctx.createGain()
    gain.gain.value = 0
    const low = ctx.createBiquadFilter()
    low.type = 'lowpass'
    low.frequency.value = 240
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = 55
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 2.3
    const depth = ctx.createGain()
    depth.gain.value = 3
    lfo.connect(depth).connect(osc.frequency)
    osc.connect(low).connect(gain).connect(engine.bus)
    osc.start()
    lfo.start()
    engine.hum = { gain }
  }
  engine.hum.gain.gain.setTargetAtTime(target * 0.045, ctx.currentTime, 0.25)
}

export const sound = { play, hum, isMuted, setMuted }

/** Subscribes to the mute choice; `chrome` decides the default when no choice is stored. */
export function useMuted(chrome: Lab['chrome']) {
  return useSyncExternalStore(
    subscribe,
    () => isMuted(chrome),
    () => chrome === 'embedded',
  )
}

/** Mount once per scene: arms the gesture gate and tells the engine which chrome it runs in. */
export function useSound(lab: Pick<Lab, 'chrome'>) {
  engine.chrome = lab.chrome
  const muted = useMuted(lab.chrome)
  useEffect(() => {
    arm()
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return
      engine.choice = readChoice()
      reflect()
      emit()
    }
    addEventListener('storage', onStorage)
    return () => {
      removeEventListener('storage', onStorage)
      hum(0)
    }
  }, [])
  return { play, hum, muted, setMuted }
}
