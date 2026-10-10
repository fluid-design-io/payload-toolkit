import { useEffect, useState } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'

import type { Lab } from '../../lab.types'

/** Blueprint hairline look. Fills take the paper colour so only strokes read; one accent carries the active thing. */
export type Look = {
  bg: string
  fg: string
  muted: string
  edge: string
  dim: string
  accent: string
  grid: string
  gridSection: string
  l: number
  s: number
}

const looks: Record<Lab['theme'], Look> = {
  dark: { bg: '#0C2440', fg: '#EAF2FA', muted: '#8FB0D0', edge: '#CFE0F2', dim: '#3B5D84', accent: '#FF8A5B', grid: '#1B3A5E', gridSection: '#2C527D', l: 40, s: 40 },
  light: { bg: '#F2F6F9', fg: '#18375A', muted: '#5C7A99', edge: '#2F65A0', dim: '#A9C2DC', accent: '#E0482B', grid: '#D3E0EC', gridSection: '#B4C9DE', l: 80, s: 50 },
}

/** One stable object per theme, so textures and colours keyed on it rebuild only when the theme changes. */
export const lookOf = (theme: Lab['theme']): Look => looks[theme]

export const AGENT_COLOR = { claude: '#D97757', codex: '#8FA3B5', none: '' } as const
export const FONT = '"Timeless Grotesk", ui-sans-serif, system-ui, sans-serif'
export const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

export const tint = (hue: number, c: Look, l = c.l) => `hsl(${hue}, ${c.s}%, ${l}%)`

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

export function fitText(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1)
  return `${t}…`
}

let fontsLoaded = false
const fontsLoading = typeof document === 'undefined' ? Promise.resolve() : Promise.all([document.fonts.load(`500 40px ${FONT}`), document.fonts.load(`600 40px ${FONT}`)]).then(() => { fontsLoaded = true }, () => { fontsLoaded = true })

/**
 * 0 until the UI face has loaded, then 1, so canvas text drawn early is
 * redrawn in it. A font face loads on first use, so this asks for it
 * outright rather than waiting on `fonts.ready`, which resolves at once
 * while nothing is loading.
 */
export function useFontsReady() {
  const [ready, setReady] = useState(fontsLoaded)
  useEffect(() => {
    if (ready) return
    let live = true
    void fontsLoading.then(() => live && setReady(true))
    return () => { live = false }
  }, [ready])
  return ready ? 1 : 0
}
