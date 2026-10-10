import { useFrame } from '@react-three/fiber'
import { useRef, useState } from 'react'

import type { ChipPartProps, ChipVariant, Sim } from './contract'

/** Every live part, drawn by the chosen chip variant; re-renders only when the live set changes. */
export function Parts({ sim, chip, ...rest }: Omit<ChipPartProps, 'p'> & { sim: Sim; chip: ChipVariant }) {
  const [, force] = useState(0)
  const seen = useRef(-1)
  useFrame(() => {
    if (sim.liveVersion !== seen.current) {
      seen.current = sim.liveVersion
      force((v) => v + 1)
    }
  })
  const Part = chip.Part
  return (
    <>
      {[...sim.live].map((p) => (
        <Part key={p.item.ref} p={p} {...rest} />
      ))}
    </>
  )
}
