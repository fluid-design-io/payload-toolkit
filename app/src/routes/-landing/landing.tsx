import type { PropsWithChildren } from 'react'
import { LandingFigure } from './landing.figure'
import { LandingHeader } from './landing.header'
import { LandingIntro } from './landing.intro'

function LandingRoot({ children }: PropsWithChildren) {
  return <>{children}</>
}

function LandingMain({ children }: PropsWithChildren) {
  return (
    <main className="border-x border-border container mx-auto min-h-svh">
      <section className="relative pb-32 pt-16 lg:pt-24">
        <div className="mx-auto w-full max-w-5xl px-6 flex flex-col items-center">
          {children}
        </div>
      </section>
    </main>
  )
}

export const Landing = Object.assign(LandingRoot, {
  Header: LandingHeader,
  Main: LandingMain,
  Figure: LandingFigure,
  Intro: LandingIntro,
})
