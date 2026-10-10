import type React from 'react'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Edges, RoundedBox, useTexture } from '@react-three/drei'
import * as THREE from 'three'

import type { CatalogItem, CategoryId, Setup } from '../../../workspace/-workspace/workspace.types'
import type { Lab, MockProps } from '../lab.types'

type SlotKey = 'framework' | 'database' | 'packageManager' | 'agent'
type Option = { value: string; label: string; hue: number; sat: number }
type Slot = { key: SlotKey; code: string; title: string; x: number; options: readonly Option[] }
type Fx = { clunk: number; boot: number; copied: number; press: number }
type Hover = { title: string; label: string } | null
type Tokens = typeof palette.light

const palette = {
  light: { bg: '#EDF1F3', surface: '#FFFFFF', body: '#F7F9FA', line: '#A3ADB2', faint: '#D3D8DB', fg: '#1D2225', muted: '#727C81', slot: '#1D2225', accent: '#5A91AD' },
  dark: { bg: '#090E11', surface: '#12171A', body: '#192126', line: '#4D585E', faint: '#292F32', fg: '#FCFCFC', muted: '#8A9094', slot: '#020405', accent: '#5A91AD' },
}

const W = 5.4
const H = 0.9
const D = 2.8
const CW = 0.86
const CH = 1.12
const CT = 0.22
const DEPTH = 0.42
const SLOT_Z = -0.55
const CARD = { w: 1.3, h: 0.17, d: 0.95 }
const DOCK = { x: 4.05, z: -0.2, top: 0.42 }

const slots: readonly Slot[] = [
  { key: 'framework', code: 'FW', title: 'Framework', x: -2.0, options: [
    { value: 'next', label: 'Next.js', hue: 210, sat: 0 },
    { value: 'tanstack', label: 'TanStack Start', hue: 32, sat: 55 },
  ] },
  { key: 'database', code: 'DB', title: 'Database', x: -0.67, options: [
    { value: 'postgres', label: 'PostgreSQL', hue: 212, sat: 45 },
    { value: 'mongodb', label: 'MongoDB', hue: 135, sat: 40 },
  ] },
  { key: 'packageManager', code: 'PM', title: 'Package manager', x: 0.67, options: [
    { value: 'pnpm', label: 'pnpm', hue: 42, sat: 60 },
    { value: 'npm', label: 'npm', hue: 356, sat: 55 },
    { value: 'bun', label: 'Bun', hue: 28, sat: 30 },
  ] },
  { key: 'agent', code: 'AI', title: 'Agent', x: 2.0, options: [
    { value: 'none', label: 'No agent', hue: 200, sat: 0 },
    { value: 'claude', label: 'Claude Code', hue: 18, sat: 55 },
    { value: 'codex', label: 'Codex', hue: 250, sat: 40 },
  ] },
]

const now = () => performance.now() / 1000
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const easeOutBack = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2
const hsl = (hue: number, sat: number, light: number) => `hsl(${hue}, ${sat}%, ${light}%)`
const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10000) / 10000
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  draw(canvas.getContext('2d')!)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

const sans = '"Timeless Grotesk", ui-sans-serif, system-ui, sans-serif'
const mono = 'ui-monospace, "SF Mono", Menlo, monospace'

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
}

function cartLabel(slot: Slot, option: Option) {
  return canvasTexture(256, 176, (g) => {
    g.fillStyle = hsl(option.hue, option.sat, 66)
    roundRect(g, 0, 0, 256, 176, 14)
    g.fill()
    g.fillStyle = 'rgba(0,0,0,0.12)'
    g.fillRect(0, 128, 256, 48)
    g.fillStyle = '#1D2225'
    g.font = `600 20px ${sans}`
    g.fillText(slot.title.toUpperCase(), 18, 34)
    let size = 50
    g.font = `700 ${size}px ${sans}`
    while (g.measureText(option.label).width > 220 && size > 20) g.font = `700 ${--size}px ${sans}`
    g.fillText(option.label, 18, 100)
    g.font = `600 18px ${mono}`
    g.fillText(`${slot.code}-${option.value.toUpperCase().slice(0, 6)}`, 18, 160)
    g.beginPath()
    g.arc(226, 150, 12, 0, Math.PI * 2)
    g.fill()
  })
}

function printed(text: string, w: number, h: number, color: string, size: number, align: CanvasTextAlign = 'center') {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = color
    g.font = `700 ${size}px ${sans}`
    g.textAlign = align
    g.textBaseline = 'middle'
    g.fillText(text, align === 'center' ? w / 2 : 8, h / 2)
  })
}

function setCursor(on: boolean) {
  document.body.style.cursor = on ? 'pointer' : ''
}

function homeOf(index: number, total: number) {
  const spread = 1.12
  const a = -spread + (index / (total - 1)) * spread * 2
  return { x: Math.sin(a) * 5.7, z: Math.cos(a) * 3.0 + 2.0, ry: a * 0.2 }
}

function useOptionsLayout() {
  return useMemo(() => {
    const flat: { slot: Slot; option: Option; order: number }[] = []
    let order = 0
    slots.forEach((slot, s) => {
      slot.options.forEach((option) => flat.push({ slot, option, order: order++ + s * 0.7 }))
    })
    const max = flat[flat.length - 1].order
    return flat.map((entry) => ({ ...entry, home: homeOf(entry.order, max + 1) }))
  }, [])
}

function Cartridge({ slot, option, home, inserted, fx, tokens, onHover, lab }: {
  slot: Slot
  option: Option
  home: { x: number; z: number; ry: number }
  inserted: boolean
  fx: Fx
  tokens: Tokens
  onHover: (hover: Hover) => void
  lab: Lab
}) {
  const group = useRef<THREE.Group>(null)
  const label = useMemo(() => cartLabel(slot, option), [slot, option])
  const [hovered, setHovered] = useState(false)
  const homePos = useMemo(() => new THREE.Vector3(home.x, 0.12 + CH / 2, home.z), [home])
  const slotPos = useMemo(() => new THREE.Vector3(slot.x, H + CH / 2 - DEPTH, SLOT_Z), [slot])
  const flight = useRef<{ kind: 'insert' | 'eject' | 'rest'; start: number; from: THREE.Vector3; fromRy: number; landed: boolean }>({
    kind: 'rest',
    start: -9,
    from: new THREE.Vector3(),
    fromRy: 0,
    landed: true,
  })
  const first = useRef(true)
  const lift = useRef(0)

  useEffect(() => {
    const g = group.current
    if (!g) return
    if (first.current) {
      first.current = false
      g.position.copy(inserted ? slotPos : homePos)
      g.rotation.set(0, inserted ? 0 : home.ry, 0)
      return
    }
    flight.current = {
      kind: inserted ? 'insert' : 'eject',
      start: now() + (inserted ? 0 : 0.05),
      from: g.position.clone(),
      fromRy: g.rotation.y,
      landed: false,
    }
  }, [inserted, slotPos, homePos, home.ry])

  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    const f = flight.current
    const t = now() - f.start
    lift.current += ((hovered && !inserted ? 0.22 : 0) - lift.current) * Math.min(1, dt * 14)
    if (f.kind === 'insert') {
      const hover = tmp.copy(slotPos).setY(slotPos.y + 1.35)
      const p = clamp(t / 0.95)
      if (p < 0.55) {
        const u = easeInOut(p / 0.55)
        const c = f.from.clone().lerp(hover, 0.5).setY(Math.max(f.from.y, hover.y) + 2.2)
        g.position.set(
          (1 - u) ** 2 * f.from.x + 2 * (1 - u) * u * c.x + u * u * hover.x,
          (1 - u) ** 2 * f.from.y + 2 * (1 - u) * u * c.y + u * u * hover.y,
          (1 - u) ** 2 * f.from.z + 2 * (1 - u) * u * c.z + u * u * hover.z,
        )
        g.rotation.set(Math.sin(u * Math.PI) * 0.5, f.fromRy * (1 - u) + Math.PI * 2 * u, Math.sin(u * Math.PI) * 0.3)
      } else if (p < 0.72) {
        const w = (p - 0.55) / 0.17
        g.position.copy(hover)
        g.position.y += Math.sin(w * Math.PI) * 0.12
        g.rotation.set(0, 0, Math.sin(w * Math.PI * 4) * 0.04 * (1 - w))
      } else {
        const u = ((p - 0.72) / 0.28) ** 2.4
        g.position.copy(hover).setY(hover.y + (slotPos.y - hover.y) * u)
        g.rotation.set(0, 0, 0)
        if (p >= 1 && !f.landed) {
          f.landed = true
          fx.clunk = now()
          fx.boot = now()
        }
      }
      if (f.landed) {
        const s = now() - fx.clunk
        g.position.copy(slotPos)
        g.position.y += -0.05 * Math.exp(-9 * s) * Math.cos(28 * s)
      }
    } else if (f.kind === 'eject') {
      const p = clamp(t / 1.05)
      if (t < 0) return
      const popTop = tmp.copy(f.from).setY(f.from.y + 1.9).setZ(f.from.z + 0.5)
      if (p < 0.24) {
        const u = easeOutBack(p / 0.24)
        g.position.copy(f.from).lerp(popTop, u)
        g.rotation.set(-0.4 * u, 0, Math.sin(u * 9) * 0.12)
      } else {
        const u = easeInOut((p - 0.24) / 0.76)
        const c = popTop.clone().lerp(homePos, 0.5).setY(popTop.y + 1.2)
        g.position.set(
          (1 - u) ** 2 * popTop.x + 2 * (1 - u) * u * c.x + u * u * homePos.x,
          (1 - u) ** 2 * popTop.y + 2 * (1 - u) * u * c.y + u * u * homePos.y,
          (1 - u) ** 2 * popTop.z + 2 * (1 - u) * u * c.z + u * u * homePos.z,
        )
        g.rotation.set(-0.4 * (1 - u) - Math.PI * 2 * u, home.ry * u, 0)
        if (p >= 1) f.landed = true
      }
      if (f.landed) {
        const s = t - 1.05
        g.position.copy(homePos)
        g.position.y += Math.abs(Math.sin(s * 14)) * 0.25 * Math.exp(-6 * s)
        g.rotation.set(0, home.ry, 0)
      }
    }
    if (!inserted && f.landed) g.position.y = homePos.y + lift.current + (f.kind === 'eject' ? Math.abs(Math.sin((t - 1.05) * 14)) * 0.25 * Math.exp(-6 * (t - 1.05)) : 0)
  })

  const edge = inserted ? tokens.accent : hovered ? tokens.fg : tokens.line
  return (
    <>
      <mesh position={[home.x, 0.06, home.z]} rotation={[0, home.ry, 0]}>
        <boxGeometry args={[CW + 0.22, 0.12, CT + 0.3]} />
        <meshStandardMaterial color={tokens.body} roughness={1} />
        <Edges color={inserted ? tokens.accent : tokens.line} />
      </mesh>
      <mesh position={[home.x, 0.122, home.z]} rotation={[0, home.ry, 0]}>
        <boxGeometry args={[CW + 0.04, 0.004, CT + 0.06]} />
        <meshBasicMaterial color={inserted ? tokens.accent : tokens.faint} transparent opacity={inserted ? 0.35 : 1} />
      </mesh>
      <group
        ref={group}
        onClick={(e) => {
          e.stopPropagation()
          onHover(null)
          setCursor(false)
          if (!inserted) lab.set(slot.key, option.value as never)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
          setCursor(true)
          onHover({ title: option.label, label: inserted ? `${slot.title} · inserted` : `Insert into ${slot.title}` })
        }}
        onPointerOut={() => {
          setHovered(false)
          setCursor(false)
          onHover(null)
        }}
      >
        <RoundedBox args={[CW, CH, CT]} radius={0.05} smoothness={2}>
          <meshStandardMaterial color={tokens.surface} roughness={0.9} />
          <Edges threshold={15} color={edge} />
        </RoundedBox>
        <mesh position={[0, CH / 2 - 0.13, CT / 2 + 0.003]}>
          <planeGeometry args={[CW * 0.7, 0.012]} />
          <meshBasicMaterial color={edge} />
        </mesh>
        <mesh position={[0, CH / 2 - 0.18, CT / 2 + 0.003]}>
          <planeGeometry args={[CW * 0.7, 0.012]} />
          <meshBasicMaterial color={edge} />
        </mesh>
        <mesh position={[0, 0.16, CT / 2 + 0.004]}>
          <planeGeometry args={[CW * 0.82, CW * 0.82 * (176 / 256)]} />
          <meshBasicMaterial map={label} toneMapped={false} />
        </mesh>
      </group>
    </>
  )
}

function Console({ lab, fx, tokens, onHover }: { lab: Lab; fx: Fx; tokens: Tokens; onHover: (h: Hover) => void }) {
  const body = useRef<THREE.Group>(null)
  const cap = useRef<THREE.Mesh>(null)
  const knob = useRef<THREE.Mesh>(null)
  const isNew = lab.setup.target === 'new'
  const brand = useMemo(() => printed('PAYLOAD·64', 512, 80, tokens.muted, 46), [tokens.muted])
  const copyTop = useMemo(() => printed('COPY', 256, 256, '#FFFFFF', 72), [])
  const switchText = useMemo(
    () =>
      canvasTexture(512, 128, (g) => {
        g.fillStyle = tokens.muted
        g.font = `700 34px ${sans}`
        g.textAlign = 'center'
        g.fillText('ADD', 92, 110)
        g.fillText('NEW', 420, 110)
        g.font = `600 26px ${sans}`
        g.fillText('POWER · TARGET', 256, 34)
      }),
    [tokens.muted],
  )
  const slotCodes = useMemo(() => slots.map((s) => printed(s.code, 128, 64, tokens.muted, 40)), [tokens.muted])

  useFrame((_, dt) => {
    const s = now() - fx.clunk
    if (body.current) {
      const k = Math.exp(-7 * s) * Math.cos(26 * s)
      body.current.scale.set(1 + 0.012 * k, 1 - 0.05 * k, 1 + 0.012 * k)
    }
    if (cap.current) {
      const p = now() - fx.press
      cap.current.position.y = 0.17 - 0.13 * Math.exp(-5 * p) * (p < 0.08 ? 1 : Math.cos((p - 0.08) * 20) * 0.7 + 0.3)
    }
    if (knob.current) knob.current.position.x += ((isNew ? 0.34 : -0.34) - knob.current.position.x) * Math.min(1, dt * 16)
  })

  return (
    <group>
      <group ref={body}>
        <RoundedBox args={[W, H, D]} radius={0.16} smoothness={2} position={[0, H / 2, 0]}>
          <meshStandardMaterial color={tokens.body} roughness={0.95} />
          <Edges threshold={15} color={tokens.line} />
        </RoundedBox>
        <mesh position={[0, H + 0.002, D / 2 - 0.36]}>
          <boxGeometry args={[W - 0.5, 0.004, 0.012]} />
          <meshBasicMaterial color={tokens.faint} />
        </mesh>
        {slots.map((slot, i) => (
          <group key={slot.key} position={[slot.x, H + 0.003, SLOT_Z]}>
            <mesh>
              <boxGeometry args={[CW + 0.12, 0.01, CT + 0.1]} />
              <meshBasicMaterial color={tokens.slot} />
            </mesh>
            <mesh position={[0, 0.001, -0.42]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.36, 0.18]} />
              <meshBasicMaterial map={slotCodes[i]} transparent toneMapped={false} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, H + 0.004, 0.62]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.8, 0.28]} />
          <meshBasicMaterial map={brand} transparent toneMapped={false} />
        </mesh>
        {[-0.24, -0.12, 0, 0.12, 0.24].map((dz) => (
          <mesh key={dz} position={[0.05, H + 0.004, 0.95 + dz * 0.6]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.2, 0.025]} />
            <meshBasicMaterial color={tokens.faint} />
          </mesh>
        ))}
        <group
          position={[-1.85, H, 0.72]}
          onClick={(e) => {
            e.stopPropagation()
            lab.set('target', isNew ? 'existing' : 'new')
            onHover({ title: isNew ? 'Existing project' : 'New project', label: 'Flip to switch target' })
            fx.boot = now()
            fx.clunk = now() - 0.25
          }}
          onPointerOver={(e) => {
            e.stopPropagation()
            setCursor(true)
            onHover({ title: isNew ? 'New project' : 'Existing project', label: 'Flip to switch target' })
          }}
          onPointerOut={() => {
            setCursor(false)
            onHover(null)
          }}
        >
          <mesh position={[0, 0.01, 0]}>
            <boxGeometry args={[1.15, 0.02, 0.26]} />
            <meshBasicMaterial color={tokens.slot} />
          </mesh>
          <mesh ref={knob} position={[-0.34, 0.1, 0]}>
            <boxGeometry args={[0.36, 0.18, 0.34]} />
            <meshStandardMaterial color={isNew ? tokens.accent : tokens.surface} roughness={0.8} />
            <Edges color={isNew ? tokens.accent : tokens.line} />
          </mesh>
          <mesh position={[0, 0.005, -0.04]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.3, 0.62]} />
            <meshBasicMaterial map={switchText} transparent toneMapped={false} depthWrite={false} />
          </mesh>
          <mesh position={[0.72, 0.03, -0.2]}>
            <sphereGeometry args={[0.05, 16, 16]} />
            <meshBasicMaterial color={isNew ? '#7CE0A0' : tokens.faint} toneMapped={false} />
          </mesh>
        </group>
        <group
          position={[1.85, H, 0.72]}
          onClick={(e) => {
            e.stopPropagation()
            fx.press = now()
            fx.copied = now()
            void navigator.clipboard?.writeText(lab.command).catch(() => {})
          }}
          onPointerOver={(e) => {
            e.stopPropagation()
            setCursor(true)
            onHover({ title: 'Copy command', label: `${lab.setup.items.length} expansions` })
          }}
          onPointerOut={() => {
            setCursor(false)
            onHover(null)
          }}
        >
          <mesh position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.56, 0.6, 0.06, 48]} />
            <meshStandardMaterial color={tokens.surface} roughness={0.9} />
            <Edges color={tokens.line} threshold={30} />
          </mesh>
          <mesh ref={cap} position={[0, 0.17, 0]}>
            <cylinderGeometry args={[0.44, 0.46, 0.24, 48]} />
            <meshStandardMaterial color={tokens.accent} roughness={0.55} />
            <Edges color={'#3D6F88'} threshold={30} />
            <mesh position={[0, 0.121, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.4, 48]} />
              <meshBasicMaterial map={copyTop} transparent toneMapped={false} />
            </mesh>
          </mesh>
        </group>
        <mesh position={[W / 2 + 0.2, 0.28, DOCK.z]}>
          <boxGeometry args={[0.5, 0.18, 0.5]} />
          <meshStandardMaterial color={tokens.body} />
          <Edges color={tokens.line} />
        </mesh>
      </group>
    </group>
  )
}

function wrap(text: string, cols: number) {
  const out: string[] = []
  for (const raw of text.split('\n')) {
    let line = raw
    if (!line.length) out.push('')
    while (line.length) {
      out.push(line.slice(0, cols))
      line = line.slice(cols)
    }
  }
  return out
}

function bootText(setup: Setup, lab: Lab) {
  const pick = (slot: Slot) => slot.options.find((o) => o.value === setup[slot.key])?.label ?? '?'
  const row = (code: string, value: string) => `${code}  ${value.toUpperCase().padEnd(16, '.')}OK`
  return [
    'PAYLOAD TOOLKIT BIOS  v4.0',
    '(C) PAYLOAD-64 SYSTEMS',
    '',
    ...slots.map((slot) => row(slot.code, pick(slot))),
    row('EX', `${setup.items.length} cart${setup.items.length === 1 ? '' : 's'}`),
    `TG  ${setup.target === 'new' ? `NEW ./${setup.name}` : 'EXISTING PROJECT'}`,
    '',
    `$ ${lab.command}`,
  ].join('\n')
}

function Crt({ lab, fx, tokens }: { lab: Lab; fx: Fx; tokens: Tokens }) {
  const canvas = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = 768
    return c
  }, [])
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }, [canvas])
  const text = bootText(lab.setup, lab)
  const state = useRef({ text, shown: 0, boot: fx.boot, last: '' })
  if (state.current.text !== text) {
    let i = 0
    const a = state.current.text
    while (i < a.length && i < text.length && a[i] === text[i]) i++
    state.current.text = text
    state.current.shown = Math.min(state.current.shown, i)
  }
  const tv = useRef<THREE.Group>(null)

  useFrame((_, dt) => {
    const s = state.current
    if (s.boot !== fx.boot) {
      s.boot = fx.boot
      s.shown = 0
    }
    const remaining = s.text.length - s.shown
    s.shown = Math.min(s.text.length, s.shown + dt * (240 + remaining * 2.2))
    const t = now()
    const sinceBoot = t - fx.boot
    const sinceCopy = t - fx.copied
    const blink = Math.floor(t * 2.5) % 2
    const key = `${Math.floor(s.shown)}|${blink}|${sinceBoot < 0.4 ? t : ''}|${sinceCopy < 1.8 ? Math.floor(sinceCopy * 6) : ''}|${tokens.bg}`
    if (tv.current) {
      const k = Math.exp(-7 * (t - fx.clunk)) * Math.cos(26 * (t - fx.clunk))
      tv.current.position.y = 0.06 * Math.max(0, k)
    }
    if (key === s.last) return
    s.last = key
    const g = canvas.getContext('2d')!
    const glow = '#9ED8F2'
    g.fillStyle = '#071014'
    g.fillRect(0, 0, 1024, 768)
    if (sinceBoot < 0.3) {
      for (let i = 0; i < 1400; i++) {
        g.fillStyle = `rgba(158,216,242,${Math.random() * 0.5})`
        g.fillRect(Math.random() * 1024, Math.random() * 768, 4, 3)
      }
    } else {
      const font = 37
      const lh = 45
      const cols = 42
      g.font = `600 ${font}px ${mono}`
      g.textBaseline = 'top'
      g.fillStyle = glow
      g.fillRect(0, 0, 1024, 54)
      g.fillStyle = '#071014'
      g.fillText(`P-64  ${lab.setup.items.length.toString().padStart(2, '0')} EXP  ${lab.setup.packageManager.toUpperCase()}`, 36, 13)
      g.textAlign = 'right'
      g.fillText(lab.setup.target === 'new' ? 'INIT' : 'ADD', 988, 13)
      g.textAlign = 'left'
      const lines = wrap(s.text.slice(0, Math.floor(s.shown)), cols)
      const rows = 14
      const visible = lines.slice(-rows)
      g.shadowColor = glow
      g.shadowBlur = 14
      const bios = wrap(s.text.slice(0, s.text.indexOf('$ ')), cols).length - 1
      const offset = lines.length - visible.length
      visible.forEach((line, i) => {
        g.fillStyle = offset + i >= bios ? '#FFFFFF' : glow
        g.fillText(line, 36, 78 + i * lh)
      })
      if (blink && s.shown >= s.text.length) {
        const last = visible[visible.length - 1] ?? ''
        g.fillRect(36 + g.measureText(last).width + 4, 78 + (visible.length - 1) * lh, 18, font)
      }
      g.shadowBlur = 0
      if (sinceCopy < 1.8 && Math.floor(sinceCopy * 6) % 2 === 0) {
        g.fillStyle = glow
        g.fillRect(212, 330, 600, 90)
        g.fillStyle = '#071014'
        g.font = `700 40px ${mono}`
        g.textAlign = 'center'
        g.fillText('COPIED TO CLIPBOARD', 512, 356)
        g.textAlign = 'left'
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.28)'
    for (let y = 0; y < 768; y += 4) g.fillRect(0, y, 1024, 2)
    const v = g.createRadialGradient(512, 384, 260, 512, 384, 680)
    v.addColorStop(0, 'rgba(0,0,0,0)')
    v.addColorStop(1, 'rgba(0,0,0,0.55)')
    g.fillStyle = v
    g.fillRect(0, 0, 1024, 768)
    texture.needsUpdate = true
  })

  return (
    <group position={[0, 0, -3.3]}>
      <RoundedBox args={[2.4, 0.9, 1.7]} radius={0.12} smoothness={2} position={[0, 0.45, 0]}>
        <meshStandardMaterial color={tokens.body} roughness={0.95} />
        <Edges threshold={15} color={tokens.line} />
      </RoundedBox>
      <group ref={tv}>
        <RoundedBox args={[5.0, 3.5, 2.3]} radius={0.3} smoothness={2} position={[0, 0.9 + 1.75, 0]}>
          <meshStandardMaterial color={tokens.body} roughness={0.95} />
          <Edges threshold={15} color={tokens.line} />
        </RoundedBox>
        <RoundedBox args={[4.4, 3.05, 0.1]} radius={0.22} smoothness={2} position={[0, 0.9 + 1.75 + 0.05, 1.13]}>
          <meshStandardMaterial color={tokens.slot} roughness={0.6} />
        </RoundedBox>
        <mesh position={[0, 0.9 + 1.75 + 0.05, 1.19]}>
          <planeGeometry args={[4.12, 3.09 * (4.12 / 4.12) * 0.9]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
        <mesh position={[2.15, 1.05, 1.16]}>
          <sphereGeometry args={[0.045, 12, 12]} />
          <meshBasicMaterial color="#7CE0A0" toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

function ScreenshotFace({ url }: { url: string }) {
  const texture = useTexture(url)
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace
    const img = texture.image as { width: number; height: number } | undefined
    if (img?.width) {
      const repeat = Math.min(1, img.width / (CARD.w / CARD.d) / img.height)
      texture.repeat.set(1, repeat)
      texture.offset.set(0, 1 - repeat)
      texture.needsUpdate = true
    }
  }, [texture])
  return (
    <mesh position={[0, CARD.h / 2 + 0.002, 0.05]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[CARD.w - 0.24, CARD.d - 0.3]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}

function TitleFace({ item }: { item: CatalogItem }) {
  const texture = useMemo(
    () =>
      canvasTexture(256, 160, (g) => {
        g.fillStyle = '#FFFFFF'
        g.fillRect(0, 0, 256, 160)
        g.fillStyle = '#1D2225'
        g.font = `700 30px ${sans}`
        g.fillText(item.title.slice(0, 14), 14, 70)
        g.font = `500 20px ${sans}`
        g.fillStyle = '#727C81'
        g.fillText(item.label, 14, 110)
      }),
    [item],
  )
  return (
    <mesh position={[0, CARD.h / 2 + 0.002, 0.05]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[CARD.w - 0.24, CARD.d - 0.3]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}

type PileEntry = { ref: string; born: number; leaving?: number }

function PileCard({ item, index, entry, spacing, tokens, theme, onHover, onEject }: {
  item: CatalogItem
  index: number
  entry: PileEntry
  spacing: number
  tokens: Tokens
  theme: Lab['theme']
  onHover: (h: Hover) => void
  onEject: () => void
}) {
  const group = useRef<THREE.Group>(null)
  const sim = useRef({ y: DOCK.top + index * spacing + 5, vy: 0 })
  const r = hash(item.ref)
  const jitter = { x: (r - 0.5) * 0.14, z: (hash(item.ref + 'z') - 0.5) * 0.1, ry: (r - 0.5) * 0.22 }
  const url = theme === 'dark' ? (item.imageDark ?? item.image) : item.image
  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    const t = now()
    const s = sim.current
    if (t < entry.born) {
      g.visible = false
      return
    }
    g.visible = true
    const step = Math.min(dt, 1 / 30)
    if (entry.leaving) {
      const p = t - entry.leaving
      s.vy += 14 * step
      s.y += s.vy * step
      g.position.set(DOCK.x + jitter.x + p * 2.5, s.y, DOCK.z + jitter.z - p * 1.2)
      g.rotation.set(p * 5, jitter.ry + p * 3, p * 4)
      g.scale.setScalar(Math.max(0.001, 1 - p * 1.6))
      return
    }
    const target = DOCK.top + index * spacing + CARD.h / 2
    s.vy += ((target - s.y) * 260 - s.vy * 16) * step
    s.y += s.vy * step
    g.position.set(DOCK.x + jitter.x, s.y, DOCK.z + jitter.z)
    g.rotation.set(Math.max(-0.3, Math.min(0.3, s.vy * 0.015)), jitter.ry, 0)
  })
  return (
    <group
      ref={group}
      onClick={(e) => {
        e.stopPropagation()
        onEject()
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setCursor(true)
        onHover({ title: item.title, label: `${item.label} · click to eject` })
      }}
      onPointerOut={() => {
        setCursor(false)
        onHover(null)
      }}
    >
      <RoundedBox args={[CARD.w, CARD.h, CARD.d]} radius={0.03} smoothness={2}>
        <meshStandardMaterial color={hsl(item.hue, 55, theme === 'dark' ? 48 : 62)} roughness={0.8} />
        <Edges threshold={15} color={hsl(item.hue, 35, theme === 'dark' ? 70 : 40)} />
      </RoundedBox>
      <mesh position={[0, CARD.h / 2 + 0.001, -CARD.d / 2 + 0.06]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[CARD.w - 0.3, 0.03]} />
        <meshBasicMaterial color={tokens.fg} transparent opacity={0.35} />
      </mesh>
      {url ? (
        <Suspense fallback={<TitleFace item={item} />}>
          <ScreenshotFace url={url} />
        </Suspense>
      ) : (
        <TitleFace item={item} />
      )}
    </group>
  )
}

function Dock({ lab, tokens, onHover }: { lab: Lab; tokens: Tokens; onHover: (h: Hover) => void }) {
  const byRef = useMemo(() => new Map(lab.catalog.items.map((item) => [item.ref, item])), [lab.catalog])
  const [pile, setPile] = useState<PileEntry[]>(() => lab.setup.items.map((ref, i) => ({ ref, born: now() + 0.6 + i * 0.08 })))
  useEffect(() => {
    setPile((prev) => {
      const t = now()
      const selected = new Set(lab.setup.items)
      const next = prev
        .filter((p) => !(p.leaving && selected.has(p.ref)))
        .map((p) => (!selected.has(p.ref) && !p.leaving ? { ...p, leaving: t } : p))
      const have = new Set(next.filter((p) => !p.leaving).map((p) => p.ref))
      let k = 0
      for (const ref of lab.setup.items) if (!have.has(ref)) next.push({ ref, born: t + k++ * 0.07 })
      return next
    })
  }, [lab.setup.items])
  useEffect(() => {
    if (!pile.some((p) => p.leaving)) return
    const id = setTimeout(() => setPile((prev) => prev.filter((p) => !p.leaving || now() - p.leaving < 0.7)), 750)
    return () => clearTimeout(id)
  }, [pile])
  const live = pile.filter((p) => !p.leaving)
  const spacing = Math.min(CARD.h + 0.02, 4 / Math.max(1, live.length))
  let i = 0
  return (
    <group>
      <RoundedBox args={[1.7, DOCK.top, 1.35]} radius={0.08} smoothness={2} position={[DOCK.x, DOCK.top / 2, DOCK.z]}>
        <meshStandardMaterial color={tokens.body} roughness={0.95} />
        <Edges threshold={15} color={tokens.line} />
      </RoundedBox>
      <mesh position={[DOCK.x, DOCK.top + 0.002, DOCK.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[CARD.w + 0.1, CARD.d + 0.1]} />
        <meshBasicMaterial color={tokens.faint} />
      </mesh>
      {pile.map((entry) => {
        const item = byRef.get(entry.ref)
        if (!item) return null
        const index = entry.leaving ? 0 : i++
        return (
          <PileCard
            key={entry.ref + (entry.leaving ?? '')}
            item={item}
            index={index}
            entry={entry}
            spacing={spacing}
            tokens={tokens}
            theme={lab.theme}
            onHover={onHover}
            onEject={() => {
              onHover(null)
              setCursor(false)
              lab.toggle(entry.ref)
            }}
          />
        )
      })}
    </group>
  )
}

function Rig({ fx }: { fx: Fx }) {
  const { camera, size } = useThree()
  useFrame(() => {
    const aspect = size.width / size.height
    const far = aspect < 0.7 ? 2.1 : aspect < 1 ? 1.9 : aspect < 1.3 ? 1.25 : 0.9
    const s = now() - fx.clunk
    const shake = 0.06 * Math.exp(-9 * s)
    camera.position.set(3 * far + Math.sin(s * 61) * shake, 11.5 * far + Math.cos(s * 47) * shake, 18.5 * far)
    camera.lookAt(0.3, aspect < 0.7 ? 1.7 : aspect < 1 ? 1.2 : 0.95, -0.2)
  })
  return null
}


type Anchor = { el: HTMLElement | null; pos: THREE.Vector3 }
const anchors = new Map<string, Anchor>()

function Pin({ id, at, children }: { id: string; at: [number, number, number]; children: React.ReactNode }) {
  const entry = anchors.get(id) ?? { el: null, pos: new THREE.Vector3() }
  anchors.set(id, entry)
  entry.pos.set(...at)
  return (
    <div ref={(el) => void (entry.el = el)} className="absolute left-0 top-0 will-change-transform">
      {children}
    </div>
  )
}

function Projector() {
  const { camera, size } = useThree()
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    for (const { el, pos } of anchors.values()) {
      if (!el) continue
      v.copy(pos).project(camera)
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -50%)`
    }
  })
  return null
}

function Pins({ lab, layout }: { lab: Lab; layout: ReturnType<typeof useOptionsLayout> }) {
  const isNew = lab.setup.target === 'new'
  const count = lab.setup.items.length
  const spacing = Math.min(CARD.h + 0.02, 4 / Math.max(1, count))
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden [&>*>*]:pointer-events-auto">
      <Pin id="sticker" at={[0, H * 0.45, D / 2 + 0.02]}>
        <label className="flex items-center gap-2 whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 font-mono text-[11px] shadow-sm" style={{ transform: 'rotate(-1.5deg)' }}>
          <span className="text-muted">{isNew ? 'NEW ▸' : 'ADD ▸'}</span>
          {isNew ? (
            <input
              value={lab.setup.name}
              onChange={(e) => lab.set('name', e.target.value)}
              spellCheck={false}
              className="w-36 bg-transparent font-semibold text-foreground outline-none"
            />
          ) : (
            <span className="font-semibold text-foreground">current project</span>
          )}
        </label>
      </Pin>
      <Pin id="dock" at={[DOCK.x, DOCK.top + count * spacing + 0.45, DOCK.z]}>
        <div className="whitespace-nowrap rounded-full border border-border bg-surface/90 px-2.5 py-1 text-[11px] font-semibold tabular-nums shadow-sm backdrop-blur">
          <span className="text-accent">+</span> {count} expansion{count === 1 ? '' : 's'}
        </div>
      </Pin>
      {slots.map((slot) => {
        const entries = layout.filter((e) => e.slot === slot)
        const x = entries.reduce((a, e) => a + e.home.x, 0) / entries.length
        const z = entries.reduce((a, e) => a + e.home.z, 0) / entries.length
        const index = slot.options.findIndex((o) => o.value === lab.setup[slot.key])
        return (
          <Pin key={slot.key} id={slot.key} at={[x, 0.1, z + 0.85]}>
            <button
              type="button"
              onClick={() => lab.set(slot.key, slot.options[(index + 1) % slot.options.length].value as never)}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface/90 py-0.5 pl-0.5 pr-2.5 text-[11px] font-medium text-muted shadow-sm backdrop-blur transition-colors hover:text-foreground"
            >
              <span className="grid size-5 place-items-center rounded-full bg-accent text-[13px] leading-none text-accent-foreground">+</span>
              {slot.title}
            </button>
          </Pin>
        )
      })}
    </div>
  )
}

function Scene({ lab, fx, tokens, onHover, layout }: { lab: Lab; fx: Fx; tokens: Tokens; onHover: (h: Hover) => void; layout: ReturnType<typeof useOptionsLayout> }) {
  return (
    <>
      <color attach="background" args={[tokens.bg]} />
      <ambientLight intensity={lab.theme === 'dark' ? 1.1 : 1.6} />
      <directionalLight position={[4, 9, 6]} intensity={lab.theme === 'dark' ? 1.2 : 1.4} />
      <directionalLight position={[-6, 4, -2]} intensity={0.4} />
      <Rig fx={fx} />
      <mesh position={[0, -0.16, 0]}>
        <cylinderGeometry args={[7.4, 7.5, 0.32, 128]} />
        <meshStandardMaterial color={tokens.surface} roughness={1} />
        <Edges color={tokens.line} threshold={20} />
      </mesh>
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[6.6, 6.62, 128]} />
        <meshBasicMaterial color={tokens.faint} />
      </mesh>
      <ContactShadows position={[0, 0.005, 0]} scale={16} blur={2.4} far={4} opacity={lab.theme === 'dark' ? 0.6 : 0.35} resolution={512} />
      <Console lab={lab} fx={fx} tokens={tokens} onHover={onHover} />
      <Crt lab={lab} fx={fx} tokens={tokens} />
      <Dock lab={lab} tokens={tokens} onHover={onHover} />
      {layout.map(({ slot, option, home }) => (
        <Cartridge
          key={`${slot.key}:${option.value}`}
          slot={slot}
          option={option}
          home={home}
          inserted={lab.setup[slot.key] === option.value}
          fx={fx}
          tokens={tokens}
          onHover={onHover}
          lab={lab}
        />
      ))}
      <Projector />
    </>
  )
}

function Rack({ lab }: { lab: Lab }) {
  const [category, setCategory] = useState<CategoryId>('all')
  const categories = [...lab.catalog.kinds, ...lab.catalog.blocks]
  const items = category === 'all' ? lab.catalog.items : lab.catalog.items.filter((item) => item.category === category)
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 border-t border-border bg-surface/85 pb-3 pt-2.5 backdrop-blur-md">
      <div className="flex items-center gap-3 px-4">
        <div className="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted">Expansion rack</div>
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto [mask-image:linear-gradient(to_right,black_92%,transparent)] [scrollbar-width:none]">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                category === c.id ? 'border-accent bg-accent text-accent-foreground' : 'border-border text-muted hover:text-foreground'
              }`}
            >
              {c.label} <span className="opacity-60">{c.count}</span>
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2 pr-16 text-xs">
          <span data-testid="count" className="tabular-nums font-semibold">{lab.selected.size} inserted</span>
          {lab.selected.size > 0 && (
            <button type="button" onClick={lab.clear} className="rounded-full border border-border px-2 py-0.5 text-muted hover:text-foreground">
              Eject all
            </button>
          )}
        </div>
      </div>
      <div ref={scroller} className="mt-2.5 flex gap-2.5 overflow-x-auto px-4 pb-1 pt-2 [scrollbar-width:thin]">
        {items.map((item) => {
          const on = lab.selected.has(item.ref)
          const url = lab.theme === 'dark' ? (item.imageDark ?? item.image) : item.image
          return (
            <button
              key={item.ref}
              type="button"
              data-ref={item.ref}
              onClick={() => lab.toggle(item.ref)}
              title={`${item.title} · ${item.label}`}
              className={`group relative w-[92px] shrink-0 text-left transition-transform duration-200 ease-out ${
                on ? 'translate-y-1.5' : 'hover:-translate-y-1.5 focus-visible:-translate-y-1.5'
              }`}
            >
              <div
                className={`rounded-[9px] border p-1.5 pt-3 shadow-sm ${on ? 'border-accent ring-2 ring-accent' : 'border-black/15'}`}
                style={{ background: hsl(item.hue, 45, lab.theme === 'dark' ? 42 : 70) }}
              >
                <div className="absolute inset-x-5 top-1 h-1 rounded-full bg-black/20" />
                <div className="aspect-[4/3] overflow-hidden rounded-[4px] bg-surface">
                  {url ? (
                    <img src={url} alt="" loading="lazy" className="size-full object-cover object-top" />
                  ) : (
                    <div className="grid size-full place-items-center p-1 text-center text-[10px] font-semibold leading-tight text-foreground">{item.title}</div>
                  )}
                </div>
                <div className="mt-1 truncate text-[9px] font-bold uppercase tracking-wide text-black/65">{item.label}</div>
              </div>
              {on && <div className="absolute -right-1 -top-1 rounded-full bg-accent px-1.5 text-[9px] font-bold text-accent-foreground">IN</div>}
              <div className={`mt-1 truncate text-[11px] ${on ? 'font-semibold text-foreground' : 'text-muted group-hover:text-foreground'}`}>{item.title}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function ConsoleDiorama({ lab }: MockProps) {
  const tokens = palette[lab.theme]
  const fx = useMemo<Fx>(() => ({ clunk: -9, boot: now(), copied: -9, press: -9 }), [])
  const [hover, setHover] = useState<Hover>(null)
  const layout = useOptionsLayout()
  const tip = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (tip.current) tip.current.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`
    }
    addEventListener('pointermove', move)
    return () => {
      removeEventListener('pointermove', move)
      setCursor(false)
    }
  }, [])
  return (
    <div className="relative h-full w-full" style={{ background: tokens.bg }}>
      <div className="absolute inset-x-0 top-0 bottom-[190px]">
        <Canvas dpr={[1, 2]} camera={{ fov: 30, position: [2.6, 7.4, 15] }} onPointerMissed={() => setHover(null)}>
          <Scene lab={lab} fx={fx} tokens={tokens} onHover={setHover} layout={layout} />
        </Canvas>
        <Pins lab={lab} layout={layout} />
      </div>
      <div className="pointer-events-none absolute bottom-[200px] left-4 z-20 hidden text-[11px] text-muted md:block">
        Click a cartridge to slot it · flip POWER for a new project · rack items pile onto the dock · hit COPY
      </div>
      <Rack lab={lab} />
      <div
        ref={tip}
        className={`pointer-events-none fixed left-0 top-0 z-50 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-lg transition-opacity ${hover ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="font-semibold text-foreground">{hover?.title}</div>
        <div className="text-muted">{hover?.label}</div>
      </div>
    </div>
  )
}
