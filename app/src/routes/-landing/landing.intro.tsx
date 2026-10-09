import { IconChevronRight, Typography, buttonVariants } from '@heroui/react'
import { Link } from '@tanstack/react-router'

export function LandingIntro() {
  return (
    <div className="mx-auto mt-12 max-w-md text-center">
      <Typography type="h1" align="center" className="text-balance">
        Payload Toolkit
      </Typography>
      <Typography color="muted" align="center" className="mt-4 text-balance">
        Payload Toolkit is a collection of tools and resources for building with Payload
        CMS.
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
  )
}
