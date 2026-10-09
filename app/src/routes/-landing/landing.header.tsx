import { LogoMark } from '@/components/logo'
import { Tooltip, buttonVariants } from '@heroui/react'
import { RiGithubFill } from '@remixicon/react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

export function LandingHeader() {
  const [githubTooltipOpen, setGithubTooltipOpen] = useState(false)

  return (
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
        <Tooltip isOpen={githubTooltipOpen} onOpenChange={setGithubTooltipOpen}>
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
  )
}
