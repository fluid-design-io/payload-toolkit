import { ActionBar } from '@heroui-pro/react';
import type { PropsWithChildren } from 'react';
import { BarBuild } from './bar.build';
import { BarCopy } from './bar.copy';
import { BarSettings } from './bar.settings';

/**
 * HeroUI Pro's ActionBar, always open because the cog must stay reachable
 * with no items. It is black in both themes on purpose, so it reads as one
 * object above any card. ActionBar's fixed outer layer takes no className, so
 * the wrapper shifts it past the 240px rail to center on the main column.
 */
function BarRoot({ children }: PropsWithChildren) {
  return (
    <div className="contents min-[769px]:[&>.action-bar]:left-[240px]">
      <ActionBar
        isOpen
        aria-label="Build actions"
        className="rounded-full glass p-1.5 text-white ring-1 ring-white/10"
      >
        {children}
      </ActionBar>
    </div>
  )
}

export const Bar = Object.assign(BarRoot, {
  Content: ActionBar.Content,
  Suffix: ActionBar.Suffix,
  Settings: BarSettings,
  Build: BarBuild,
  Copy: BarCopy,
})
