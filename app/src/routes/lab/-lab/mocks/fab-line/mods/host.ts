/**
 * What a code mod receives. Libraries are the page's own instances. `html` is
 * htm bound to React.createElement, so a mod writes JSX-like templates with no
 * build step: html`<mesh position=${[0, 1, 0]}><boxGeometry /></mesh>`.
 * `drei` is the helpers the line already ships (`Grid`, `Html`, `Line`), not
 * the whole library, which would add a large chunk to every visit.
 * `core` is the line's public kit; `builtins` are the stock registries to
 * extend or wrap. `swap` is what a socket swap style needs: the clock helpers,
 * `kick` for the scene's jolt and `play` for the line's sounds (names in
 * `sounds`; others are ignored). `rapier()` loads and initialises the physics
 * engine lazily. `keepAnimating()` keeps the scene at full frame rate for the
 * next frame (call it every frame something moves), `keepAnimating(seconds)`
 * for a stretch; frames otherwise drop to the idle rate.
 */
import { Grid, Html, Line } from '@react-three/drei'
import * as fiber from '@react-three/fiber'
import htm from 'htm'
import * as React from 'react'
import * as THREE from 'three'

import { keepAnimating } from '../../../kit/busy'
import { play, SOUND_NAMES } from '../../../kit/sound'
import type { SoundName } from '../../../kit/sound'
import { kick } from '../core/jolt'
import { boardWorld, pathWorld, placeLine, pocketWorld, railNow } from '../core/line'
import { sampleRoute, viaDistances } from '../core/route'
import { Body, pickable, useSimEvents } from '../core/scene'
import { box, cyl, fillMat, lineMat, reducedMotion, segs, textTexture } from '../core/three'
import { crossed, easeBack, easeIn, easeInOut, easeOut, every, rest, span, wobble } from '../stations/board/shared/swap/kit'
import { makeBelt } from '../stations/transport/belt.data'
import { BUILTIN } from '../world/slots'

let rapier: Promise<typeof import('@dimforge/rapier3d-compat')> | null = null

export const host = {
  api: 1,
  React,
  THREE,
  fiber,
  drei: { Grid, Html, Line },
  html: htm.bind(React.createElement),
  keepAnimating,
  core: { Body, pickable, useSimEvents, box, cyl, fillMat, lineMat, segs, textTexture, reducedMotion, placeLine, pathWorld, pocketWorld, boardWorld, railNow, makeBelt, sampleRoute, viaDistances },
  builtins: BUILTIN,
  swap: {
    every, crossed, span, easeIn, easeOut, easeInOut, easeBack, wobble, rest, kick,
    sounds: Object.freeze([...SOUND_NAMES]),
    play: (name: string) => { if (SOUND_NAMES.includes(name as SoundName)) play(name as SoundName) },
  },
  rapier: () =>
    (rapier ??= import('@dimforge/rapier3d-compat').then(async (m) => {
      const R = (m as unknown as { default?: typeof m }).default ?? m
      await R.init()
      return R
    })),
}
