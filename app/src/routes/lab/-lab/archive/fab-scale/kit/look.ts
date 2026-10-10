import { CanvasTexture, SRGBColorSpace } from 'three'

import type { Lab } from '../../../lab.types'
import type { Card } from '../model'
import type { Part } from '../sim'

/**
 * The blueprint palette, the only world this mock renders. Everything is
 * flat (meshBasicMaterial) so lighting never changes a hairline's weight.
 */
export type Look = {
  dark: boolean
  bg: string
  surface: string
  fg: string
  muted: string
  edge: string
  dim: string
  board: string
  chip: string
  chipFg: string
  accent: string
  grid: string
  gridMajor: string
  /** Lightness and saturation for category tints. */
  l: number
  s: number
}

export function lookOf(theme: Lab['theme']): Look {
  return theme === 'dark'
    ? { dark: true, bg: '#0C2440', surface: '#0C2440', fg: '#EAF2FA', muted: '#8FB0D0', edge: '#CFE0F2', dim: '#3B5D84', board: '#0E2A4A', chip: '#0C2440', chipFg: '#EAF2FA', accent: '#FF8A5B', grid: '#1B3A5E', gridMajor: '#2C527D', l: 40, s: 40 }
    : { dark: false, bg: '#F2F6F9', surface: '#F2F6F9', fg: '#18375A', muted: '#5C7A99', edge: '#2F65A0', dim: '#A9C2DC', board: '#F2F6F9', chip: '#F2F6F9', chipFg: '#18375A', accent: '#E0482B', grid: '#D3E0EC', gridMajor: '#B4C9DE', l: 80, s: 50 }
}

export const tint = (hue: number, c: Look, l = c.l) => `hsl(${hue}, ${c.s}%, ${l}%)`

export const FONT = '"Timeless Grotesk", ui-sans-serif, system-ui, sans-serif'
export const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

export function textTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d')!)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/** Truncates `text` with an ellipsis so it fits `max` pixels in the current font. */
export function fitText(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1)
  return `${t}…`
}

export type Tip = { show: (e: PointerEvent, title: string, sub: string, image?: string) => void; move: (e: PointerEvent) => void; hide: () => void }
/** `moved` is set by a drag so the click that ends it does not pick. */
export type Guard = { moved: boolean }
/** What is under the pointer, and the ref a press landed on so a long press can open its details. */
export type Hover = { card: Card | null; part: Part | null; pressed: string | null }
