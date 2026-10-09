import { Button } from '@heroui/react'
import { useState } from 'react'
import { useWorkspaceTheme } from '../workspace.theme'
import type { RegistryItem } from '../workspace.types'
import { RegistryThumbnail } from './registry.thumbnail'

export function RegistryPreview({ item }: { item: RegistryItem }) {
  const theme = useWorkspaceTheme()
  const [showImage, setShowImage] = useState(false)
  const canEmbed = item.previewEmbed && item.previewUrl
  return (
    <div className="relative size-full">
      {canEmbed && !showImage ? (
        <iframe
          src={item.previewUrl}
          title={`${item.title} live preview`}
          data-theme={theme}
          style={{ colorScheme: theme }}
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
          className="size-full border-0"
        />
      ) : (
        <RegistryThumbnail item={item} />
      )}
      {canEmbed && (
        <Button
          size="sm"
          variant="secondary"
          className="absolute right-3 bottom-3"
          onPress={() => setShowImage((value) => !value)}
        >
          {showImage ? 'Live preview' : 'Show image'}
        </Button>
      )}
    </div>
  )
}
