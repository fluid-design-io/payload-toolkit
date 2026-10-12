import { buttonVariants, cn } from '@heroui/react'
import { RiGithubFill } from '@remixicon/react'
import { createServerFn } from '@tanstack/react-start'
import { queryOptions, useQuery } from '@tanstack/react-query'

const repo = 'fluid-design-io/payload-toolkit'
const ttl = 60 * 60 * 1000

let cached: { stars: number; at: number } | undefined

/**
 * The count need not be exact, so each server instance asks GitHub at most
 * once an hour and serves the last good value when GitHub fails or is slow.
 */
const getGithubStars = createServerFn({ method: 'GET' }).handler(async () => {
  if (cached && Date.now() - cached.at < ttl) return cached.stars
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(2000),
    })
    if (!response.ok) return cached?.stars ?? null
    const { stargazers_count } = (await response.json()) as { stargazers_count: number }
    cached = { stars: stargazers_count, at: Date.now() }
    return stargazers_count
  } catch {
    return cached?.stars ?? null
  }
})

export const githubStarsQuery = queryOptions({
  queryKey: ['github-stars'],
  queryFn: () => getGithubStars(),
  staleTime: ttl,
})

export const githubUrl = `https://github.com/${repo}`

const compact = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** The star count once a loader has fetched it; undefined when it has none. */
export function useGithubStars() {
  const { data } = useQuery(githubStarsQuery)
  if (typeof data !== 'number') return undefined
  return { count: data, short: compact.format(data), label: `GitHub, ${data} stars` }
}

/** The repository link, with its star count once the loader has one. */
export function GithubStars({ className }: { className?: string }) {
  const stars = useGithubStars()

  return (
    <a
      href={githubUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={stars?.label ?? 'GitHub'}
      className={buttonVariants({
        variant: 'ghost',
        size: 'sm',
        className: cn('gap-1.5 tabular-nums', className),
      })}
    >
      <RiGithubFill size={16} aria-hidden="true" />
      {stars && <span aria-hidden="true">{stars.short}</span>}
    </a>
  )
}
