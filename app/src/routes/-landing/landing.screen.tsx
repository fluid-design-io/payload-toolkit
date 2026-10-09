import { LogoMark } from '@/components/logo'
import {
  Typography,
  IconChevronRight,
  Tooltip,
  buttonVariants,
} from '@heroui/react'
import { RiGithubFill } from '@remixicon/react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { LandingFigure } from './landing.figure'

export function LandingScreen() {
  const [githubTooltipOpen, setGithubTooltipOpen] = useState(false)

  return (
    <>
      <header className="fixed inset-x-0 top-4 z-50 mx-auto w-fit">
        <div className="bg-surface flex items-center gap-6 rounded-full p-2 backdrop-blur">
          <Link
            to="/"
            className={buttonVariants({
              variant: 'ghost',
              isIconOnly: true,
              className: 'group',
            })}
          >
            <LogoMark className="h-5 w-auto" />
          </Link>
          <Tooltip
            isOpen={githubTooltipOpen}
            onOpenChange={setGithubTooltipOpen}
          >
            <Tooltip.Trigger<'a'>
              render={(props) => <a {...props} />}
              role="link"
              href="https://github.com/fluid-design-io/payload-toolkit"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View on GitHub"
              onPointerEnter={() => setGithubTooltipOpen(true)}
              onPointerLeave={() => setGithubTooltipOpen(false)}
              className={buttonVariants({
                variant: 'ghost',
                isIconOnly: true,
                className: 'inline-flex',
              })}
            >
              <RiGithubFill className="size-5" aria-hidden="true" />
            </Tooltip.Trigger>
            <Tooltip.Content placement="bottom">View on GitHub</Tooltip.Content>
          </Tooltip>
        </div>
      </header>
      <main className="border-x border-border container mx-auto min-h-svh">
        <section className="relative pb-32 pt-16">
          <div className="mx-auto w-full max-w-5xl px-6 flex flex-col items-center">
            <LandingFigure />
            <div className="mx-auto mt-6 max-w-md text-center">
              <Typography type="h1" align="center" className="text-balance">
                Payload Toolkit
              </Typography>
              <Typography
                color="muted"
                align="center"
                className="mt-4 text-balance"
              >
                Payload Toolkit is a collection of tools and resources for
                building with Payload CMS.
              </Typography>

              <Link
                to="/workspace"
                className={buttonVariants({
                  variant: 'primary',
                  size: 'lg',
                  className: 'mt-6',
                })}
              >
                <span className="text-nowrap">Start Building</span>
                <IconChevronRight className="opacity-50" />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
