import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { Group, LineSegments as ThreeLineSegments, MeshBasicMaterial } from 'three'

import type { ChipPartProps } from '../core/contract'
import { matchItem } from '../core/sim'
import { chipMarking } from './art'
import { CloseUp } from './closeup'
import { ChipBody } from './package'

/** A live part: the package, a hover and focus ring, and the peelable close-up while it is the focused seated chip. */
export function PartView({ p, lab, c, tip, guard, cam, codeOf, onFocus }: ChipPartProps) {
  const group = useRef<Group>(null)
  const body = useRef<Group>(null)
  const ring = useRef<ThreeLineSegments>(null)
  const code = codeOf(p.item.ref)
  const top = useMemo(() => chipMarking(p.item, code, p.spec, c.body, c.ink), [p, c.body, c.ink, code])
  useEffect(() => () => top.dispose(), [top])
  const image = lab.theme === 'dark' ? (p.item.imageDark ?? p.item.image) : p.item.image
  const [close, setClose] = useState(false)
  useFrame(() => {
    const g = group.current
    if (!g) return
    g.position.copy(p.pos)
    g.scale.setScalar(Math.max(0.001, p.scale))
    g.rotation.set(p.spin * 0.35, p.spin, 0)
    const want = p.mode === 'seated' && cam.focusRef === p.item.ref
    if (want !== close) setClose(want)
    if (!want && body.current) body.current.visible = true
    if (ring.current) {
      const hot = cam.hovered === p.item.ref || (cam.focusRef === p.item.ref && !want) || p.mode === 'held' || p.mode === 'queued'
      const query = lab.focus.query.trim()
      const match = !!query && p.mode === 'seated' && matchItem(p.item, query)
      const m = ring.current.material as MeshBasicMaterial
      m.color.set(p.flash > 0 ? (lab.setup.agent === 'codex' ? c.codexInk : c.claude) : c.accent)
      ring.current.visible = hot || p.flash > 0 || match
    }
  })
  const fw = p.spec.fw + 0.12, fd = p.spec.fd + 0.12
  const ringGeo = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute([-fw / 2, 0, -fd / 2, fw / 2, 0, -fd / 2, fw / 2, 0, -fd / 2, fw / 2, 0, fd / 2, fw / 2, 0, fd / 2, -fw / 2, 0, fd / 2, -fw / 2, 0, fd / 2, -fw / 2, 0, -fd / 2], 3))
    return g
  }, [fw, fd])
  useEffect(() => () => ringGeo.dispose(), [ringGeo])
  const selected = lab.selected.has(p.item.ref)
  return (
    <group
      ref={group}
      onClick={(e) => {
        e.stopPropagation()
        if (guard.moved) return
        tip.hide()
        if (close) return
        if (p.mode === 'seated') onFocus(p.item.ref)
        else lab.toggle(p.item.ref)
      }}
      onPointerDown={() => {
        cam.pressed = p.item.ref
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        cam.hovered = p.item.ref
        if (!close) tip.show(e.nativeEvent, p.item.title, `${p.item.label} · ${code} · ${p.mode === 'seated' ? 'click to inspect' : selected ? 'click to send back' : 'click to build'}`, image)
      }}
      onPointerMove={(e) => tip.move(e.nativeEvent)}
      onPointerOut={() => { cam.hovered = null; tip.hide() }}
    >
      <ChipBody ref={body} spec={p.spec} top={top} c={c} />
      {close && <CloseUp p={p} lab={lab} c={c} cam={cam} top={top} body={body} code={code} />}
      <lineSegments ref={ring} geometry={ringGeo} visible={false} position={[0, 0.012, 0]}>
        <lineBasicMaterial color={c.accent} />
      </lineSegments>
    </group>
  )
}
