import type { Setup } from '@/routes/workspace/-workspace/workspace.types'

/** The PCB's surface height. Memory and Power were modelled on it, so other boards move them with an offset. */
export const BY = 0.62
/** Half extents of the framework CPU's package. */
export const cpuHalf = (framework: Setup['framework']) => (framework === 'next' ? { w: 1.6, d: 1.6 } : { w: 1.95, d: 1.3 })
