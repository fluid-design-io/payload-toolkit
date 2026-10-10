import { createFileRoute } from '@tanstack/react-router'
import { LabScreen } from './-lab/lab'

export const Route = createFileRoute('/lab/')({
  ssr: false,
  component: LabScreen,
})
