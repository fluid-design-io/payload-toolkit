import type { Evidence } from './support.js'

export const featureMap = {
  forms: {
    requirements: [
      'forms-access-and-validation',
      'forms-ssr-hydration-guard',
      'forms-browser-persistence-notification',
      'forms-browser-http-error',
      'forms-admin-browser',
    ],
    verify: async (
      base: string,
      evidence: Evidence,
      directory: string,
      serverLog: () => string,
    ) => {
      const { verifyForms } = await import('./forms.js')
      await verifyForms(base, evidence, directory, serverLog)
    },
  },
}
