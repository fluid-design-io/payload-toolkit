import { Typography, cn } from '@heroui/react'
import type { ComponentProps } from 'react'

/**
 * The seated block: a feature block halfway down its socket in a plate, drawn
 * in the Hairline stroke hierarchy (bright block, dim plate). Hovering the
 * nearest `group` lifts the block clear and lowers it back on leave.
 *
 * The plate's front lip is painted over the block, so the seated block's lower
 * half is hidden by the plate rather than clipped, and stops being hidden as
 * soon as it rises above the rim. `--logo-ground` must match the surface
 * behind the mark.
 */
export function LogoMark({ className, ...props }: ComponentProps<'svg'>) {
  return (
    <svg
      viewBox="2 2 60 48"
      fill="none"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      className={cn(
        'overflow-visible [--logo-ground:var(--background)]',
        className,
      )}
      {...props}
    >
      <g
        className="[&_*]:[vector-effect:non-scaling-stroke]"
        strokeWidth={1.25}
      >
        <polygon
          points="32,16 60,30 32,44 4,30"
          fill="var(--logo-ground)"
          className="stroke-muted/50"
        />
        <polyline points="14.5,30 32,21.25 49.5,30" className="stroke-muted" />
        <polyline
          points="19,31.25 32,24.75 45,31.25"
          className="stroke-muted/50"
        />
        <g className="transition-transform duration-700 ease-[cubic-bezier(.32,.72,0,1)] group-hover:-translate-y-[10px] group-focus-visible:-translate-y-[10px] motion-reduce:transition-none">
          <polygon
            points="32,14 46,21 46,35 32,42 18,35 18,21"
            fill="var(--logo-ground)"
            className="stroke-foreground"
          />
          <polyline points="18,21 32,28 46,21" className="stroke-muted/60" />
        </g>
        <polygon
          points="14.5,30 32,38.75 49.5,30 60,30 60,33 32,47 4,33 4,30"
          fill="var(--logo-ground)"
          stroke="none"
        />
        <polyline points="4,30 32,44 60,30" className="stroke-muted/50" />
        <polyline
          points="4,30 4,33 32,47 60,33 60,30"
          className="stroke-muted/50"
        />
        <polyline points="14.5,30 32,38.75 49.5,30" className="stroke-muted" />
      </g>
    </svg>
  )
}

/** The mark beside the `payload-toolkit` wordmark; the wrapper is the hover group. */
export function Logo({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn('group inline-flex items-center gap-2', className)}
      {...props}
    >
      <LogoMark className="h-8 w-auto" />
      <Typography
        render={(props) => <span {...props} />}
        type="body-sm"
        className="font-mono"
      >
        payload-toolkit
      </Typography>
    </span>
  )
}
