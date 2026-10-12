import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

// Social crawlers need absolute image URLs; Railway exposes its domain at build time.
const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN
const siteUrl = process.env.VITE_SITE_URL ?? (railwayDomain ? `https://${railwayDomain}` : '')

const config = defineConfig({
  define: { 'import.meta.env.VITE_SITE_URL': JSON.stringify(siteUrl) },
  resolve: { tsconfigPaths: true },
  plugins: [
    // React Three Fiber pierces dashed props, so a data-tsd-source stamp on a 3D element becomes a write to `object.data`.
    devtools({ injectSource: { enabled: true, ignore: { files: [/\/routes\/lab\/-lab\//] } } }),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
})

export default config
