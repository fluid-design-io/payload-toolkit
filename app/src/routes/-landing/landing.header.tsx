import { githubUrl, useGithubStars } from '@/components/github-stars'
import { LogoMark } from '@/components/logo'
import { Tooltip, buttonVariants } from '@heroui/react'
import { RiGithubFill } from '@remixicon/react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

export function LandingHeader() {
  const [githubTooltipOpen, setGithubTooltipOpen] = useState(false)
  const stars = useGithubStars()

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
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={stars ? `View on GitHub, ${stars.count} stars` : 'View on GitHub'}
            onPointerEnter={() => setGithubTooltipOpen(true)}
            onPointerLeave={() => setGithubTooltipOpen(false)}
            className={buttonVariants({
              variant: 'ghost',
              isIconOnly: !stars,
              className: 'inline-flex gap-1.5',
            })}
          >
            <RiGithubFill className="size-5" aria-hidden="true" />
            {stars && (
              <span aria-hidden="true" className="font-light tabular-nums">
                {stars.short}
              </span>
            )}
          </Tooltip.Trigger>
          <Tooltip.Content placement="bottom">View on GitHub</Tooltip.Content>
        </Tooltip>
      </div>
    </header>
  )
}
