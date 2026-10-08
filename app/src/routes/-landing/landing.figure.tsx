import { useEffect, useRef, useState } from 'react'

const bareStyleId = 'landing-bare'
const bareStyle = `
.controls, #means, #rules, .tag { display: none !important }
.plate { border: 0 !important; border-radius: 0 !important }
body { padding: 0 !important; background: transparent !important; min-height: 0 !important }
main { max-width: none !important }
html { background: transparent !important }
`

/**
 * The figure file stays untouched. Its bench chrome is stripped by a style
 * injected into the same-origin document, and the frame stays invisible until
 * then so the chrome never flashes. The load event can fire before hydration,
 * so a document that is already complete is stripped at mount.
 */
export function LandingFigure() {
  const frame = useRef<HTMLIFrameElement>(null)
  const [bare, setBare] = useState(false)

  useEffect(() => {
    const iframe = frame.current
    if (!iframe) return
    let observer: MutationObserver | undefined

    const strip = () => {
      const doc = iframe.contentDocument
      if (!doc?.head || doc.URL === 'about:blank') return
      if (!doc.getElementById(bareStyleId)) {
        const style = doc.createElement('style')
        style.id = bareStyleId
        style.textContent = bareStyle
        doc.head.append(style)
      }
      const syncTheme = () => {
        const theme = document.documentElement.dataset.theme
        if (theme) doc.documentElement.dataset.theme = theme === 'mouve-dark' ? 'dark' : 'light'
      }
      syncTheme()
      observer?.disconnect()
      observer = new MutationObserver(syncTheme)
      observer.observe(document.documentElement, { attributeFilter: ['data-theme'] })
      setBare(true)
    }

    iframe.addEventListener('load', strip)
    if (iframe.contentDocument?.readyState === 'complete') strip()
    return () => {
      iframe.removeEventListener('load', strip)
      observer?.disconnect()
    }
  }, [])

  return (
    <iframe
      ref={frame}
      src="/figures/hairline-robot-arm.html"
      title="Robot arm, an interactive Hairline figure"
      className="block aspect-[5/4] w-[min(560px,calc(100vw-32px))] border-0 bg-transparent transition-opacity duration-300"
      style={{ opacity: bare ? 1 : 0 }}
    />
  )
}
