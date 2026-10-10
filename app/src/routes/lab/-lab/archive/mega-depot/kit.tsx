import { Edges } from '@react-three/drei'
import type { ReactNode } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'

import type { Lab } from '../../lab.types'

export const ACCENT = '#5A91AD'
export const FONT = '"Timeless Grotesk", ui-sans-serif, system-ui, sans-serif'

export type Colors = ReturnType<typeof palette>
export function palette(theme: Lab['theme']) {
  return theme === 'dark'
    ? { bg: '#090E11', floor: '#0D1316', slab: '#11181C', surface: '#1B2327', fg: '#FCFCFC', muted: '#8A9094', edge: '#5C676C', faint: '#253036', dim: '#33404A', board: '#141D22', roof: '#141B1F', l: 42, s: 34, dark: true }
    : { bg: '#EDF1F3', floor: '#E6EBEE', slab: '#F4F7F8', surface: '#FFFFFF', fg: '#1D2225', muted: '#727C81', edge: '#9AA4A9', faint: '#D5DCE0', dim: '#C3CBCF', board: '#F5F9FB', roof: '#F7F9FA', l: 64, s: 46, dark: false }
}
export const tint = (hue: number, c: Colors, l = c.l, s = c.s) => `hsl(${hue}, ${s}%, ${l}%)`

export function textTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d')!)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

export function Box({ size, color, edge, position, children }: {
  size: [number, number, number]; color: string; edge: string; position?: [number, number, number]; children?: ReactNode
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={1} />
      <Edges color={edge} />
      {children}
    </mesh>
  )
}

export type Tip = { show: (e: PointerEvent, title: string, sub: string) => void; move: (e: PointerEvent) => void; hide: () => void }

const thumbs = new Map<string, HTMLCanvasElement | Promise<HTMLCanvasElement>>()

/** A 256px crop of the screenshot's top, shared by every part and bin that shows it. */
export function thumb(url: string): HTMLCanvasElement | Promise<HTMLCanvasElement> {
  const hit = thumbs.get(url)
  if (hit) return hit
  const job = new Promise<HTMLCanvasElement>((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 256
      canvas.height = 192
      const ctx = canvas.getContext('2d')!
      const h = Math.min(img.height, (img.width * 192) / 256)
      const y = Math.min(img.height - h, img.height * 0.08)
      ctx.drawImage(img, 0, y, img.width, h, 0, 0, 256, 192)
      thumbs.set(url, canvas)
      resolve(canvas)
    }
    img.onerror = () => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 4
      thumbs.set(url, canvas)
      resolve(canvas)
    }
    img.src = url
  })
  thumbs.set(url, job)
  return job
}
