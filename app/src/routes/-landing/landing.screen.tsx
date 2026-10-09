import { Landing } from './landing'

export function LandingScreen() {
  return (
    <Landing>
      <Landing.Header />
      <Landing.Main>
        <Landing.Figure />
        <Landing.Intro />
      </Landing.Main>
    </Landing>
  )
}
