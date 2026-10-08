import { buttonVariants } from '@heroui/react'
import { Link } from '@tanstack/react-router'
import { LandingFigure } from './landing.figure'

/**
 * Austere on purpose: the figure and one way in. The button is a real link so
 * it keeps native navigation (open in new tab, prefetch on intent).
 */
export function LandingScreen() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 px-4 py-8">
      <LandingFigure />
      <Link to="/workspace" className={buttonVariants({ variant: 'primary' })}>
        Start customizing
      </Link>
    </main>
  )
}
