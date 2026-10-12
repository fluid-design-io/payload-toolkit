import { Button, cn } from '@heroui/react'
import { useState } from 'react'
import { useWorkspaceTheme } from '../workspace.theme'
import type { RegistryItem } from '../workspace.types'
import { RegistryThumbnail } from './registry.thumbnail'

/**
 * The thumbnail always sits underneath, so the page morphs in and out with
 * the grid card's own image. Once the detail is `isLive`, an embeddable item
 * loads its live page over it and fades it in when it has loaded.
 */
export function RegistryPreview({ item, isLive }: { item: RegistryItem; isLive: boolean }) {
  const theme = useWorkspaceTheme()
  const [showImage, setShowImage] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const canEmbed = isLive && item.previewEmbed && item.previewUrl
  return (
    <div className="relative size-full">
      <RegistryThumbnail item={item} />
      {canEmbed && !showImage && (
        <iframe
          src={item.previewUrl}
          title={`${item.title} live preview`}
          data-theme={theme}
          style={{ colorScheme: theme }}
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
          onLoad={() => setIsLoaded(true)}
          className={cn(
            'absolute inset-0 size-full border-0 transition-opacity duration-300',
            isLoaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}
      {canEmbed && (
        <Button
          size="sm"
          variant="secondary"
          className="absolute right-3 bottom-3"
          onPress={() => {
            setIsLoaded(false)
            setShowImage((value) => !value)
          }}
        >
          {showImage ? 'Live preview' : 'Show image'}
        </Button>
      )}
    </div>
  )
}
