/** The call sheet's HeroUI choice control. It ticks on change, like every other fab line choice. */
import { cn } from '@heroui/react'
import { Segment } from '@heroui-pro/react'

import { play } from '../../../kit/sound'

/** One of a few options as a Pro Segment. Arrow keys move between them. */
export function Choice<T extends string>({ label, value, options, onChange, className }: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <Segment
      aria-label={label}
      size="sm"
      selectedKey={value}
      onSelectionChange={(key) => {
        play('tick')
        onChange(String(key) as T)
      }}
      className={cn('min-w-0', className ?? 'w-full')}
    >
      {options.map((o) => (
        <Segment.Item key={o.value} id={o.value} className="min-w-0 px-2">
          <span className="truncate">{o.label}</span>
        </Segment.Item>
      ))}
    </Segment>
  )
}
