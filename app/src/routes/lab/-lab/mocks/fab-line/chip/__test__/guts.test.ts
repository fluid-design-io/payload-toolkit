import { describe, expect, test } from 'bun:test'
import { catalog as raw } from '../../../../../../workspace/-workspace/workspace.catalog'
import { toCatalog } from '../../../../../../workspace/-workspace/workspace.utils'
import { climb, createDepth, goStage, nudge, settle, stageAt } from '../depth'
import { floorplan } from '../floorplan'
import { gutsOf, padRing } from '../guts'

const items = new Map(toCatalog(raw).items.map((i) => [i.name, i]))
const env = { framework: 'next', database: 'postgres' } as const
const labels = (name: string) => gutsOf(items.get(name)!, env).units.map((u) => u.label)

describe('guts', () => {
  test('forms follows its real submission path to the chosen database', () => {
    const g = gutsOf(items.get('forms')!, { framework: 'next', database: 'mongodb' })
    expect(g.files).toEqual(['forms/plugin.ts', 'forms/example-form.tsx', 'forms/GUIDE.md'])
    expect(g.units.map((u) => u.label)).toEqual(['PLUGIN', 'FORMS', 'EXAMPLE FORM', 'NAME', 'EMAIL', 'MESSAGE', 'SUBMISSIONS', 'VALIDATE', 'NOTIFY', 'MONGODB'])
    expect(g.nets).toContainEqual(['validate', 'mongodb'])
  })
  test('a block is its schema, the fields its words imply, and its render', () => {
    expect(labels('hero-video')).toEqual(['CONFIG.TS', 'VIDEO', 'POSTER', 'MEDIA', 'MOTION', 'COMPONENT.TSX'])
    expect(labels('hero-basic')).toEqual(['CONFIG.TS', 'HEADING', 'COPY', 'CTA', 'COMPONENT.TSX'])
    expect(labels('collection-query')).toEqual(['CONFIG.TS', 'CATEGORIES', 'QUERY', 'CARDS', 'LAYOUT', 'COMPONENT.TSX'])
    expect(gutsOf(items.get('pricing-cards')!, env).files).toEqual(['blocks/PricingCards/config.ts', 'blocks/PricingCards/Component.tsx'])
  })
  test('a component exposes its props as input pads and itself as the export', () => {
    const g = gutsOf(items.get('post-hero')!, env)
    expect(g.pads.map((p) => `${p.dir}:${p.label}`)).toEqual(['in:media', 'in:author', 'in:categories', 'in:date', 'in:heading', 'in:copy', 'out:PostHero', 'out:JSX'])
  })
  test('the pad ring keeps every signal pad and fills sides evenly with supplies', () => {
    const ring = padRing(gutsOf(items.get('hero-basic')!, env))
    expect(ring.length).toBe(12)
    expect(ring.filter((p) => p.dir !== 'pwr').map((p) => p.label)).toEqual(['pages.layout', 'admin', 'HeroBasicBlock', 'HeroBasic', 'HTML'])
  })
  test('every item gets a die with wires', () => {
    for (const item of items.values()) {
      const plan = floorplan(gutsOf(item, env))
      expect(plan.units.length).toBeGreaterThanOrEqual(4)
      expect(plan.wires.length).toBeGreaterThan(3)
      for (const u of plan.units) expect(u.w > 0.05 && u.h > 0.05).toBe(true)
    }
  })
})

describe('depth', () => {
  test('wheel input scrubs, then snaps to the nearest stage', () => {
    const d = createDepth()
    nudge(d, 1.4)
    settle(d, 0.1)
    expect(d.target).toBeCloseTo(1.4)
    settle(d, 0.3)
    expect(d.target).toBe(1)
    expect(stageAt(d.target).id).toBe('lid')
  })
  test('escape climbs one stage at a time and lets go at the package', () => {
    const d = createDepth()
    goStage(d, 4)
    expect([climb(d), d.target, climb(d), d.target]).toEqual([true, 3, true, 2])
    goStage(d, 0)
    expect(climb(d)).toBe(false)
  })
})
