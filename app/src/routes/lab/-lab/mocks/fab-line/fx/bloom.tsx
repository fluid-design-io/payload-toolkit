import { Bloom as BloomEffect, EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useEffect } from 'react'

import type { FxProps } from '../core/contract'
import { reducedMotion } from '../core/three'
import { glowGain } from './glow'
import { isDark } from './heat'

/**
 * Selective bloom by brightness: glow cores render above 1 (HDR) while the
 * composer runs, and the threshold sits at 1, so only arcs, laser hits and
 * hot beads bloom; hairlines and labels never cross it. Light grounds skip
 * the composer entirely, since a glow on paper is ink, not light. The
 * composer takes over the renderer's ACES tone mapping, so it ends with it.
 */
export function Bloom({ c }: FxProps) {
  const on = isDark(c)
  useEffect(() => {
    glowGain.value = on ? 3.2 : 1
    return () => { glowGain.value = 1 }
  }, [on])
  if (!on) return null
  return (
    <EffectComposer multisampling={4} enableNormalPass={false}>
      <BloomEffect mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={reducedMotion ? 0.6 : 1.1} radius={0.7} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}
