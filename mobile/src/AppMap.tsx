import { lazy, Suspense, type ComponentProps } from 'react'
import { isExpoGo } from './environment'
import type { JourneyMap as NativeJourneyMap, LoginMap as NativeLoginMap } from './JourneyMap'

const Preview = lazy(() => import('./PreviewMap').then(module => ({ default: module.PreviewMap })))
const LiveJourney = lazy(() => import('./JourneyMap').then(module => ({ default: module.JourneyMap })))
const LiveLogin = lazy(() => import('./JourneyMap').then(module => ({ default: module.LoginMap })))

export function JourneyMap(props: ComponentProps<typeof NativeJourneyMap>) {
  return <Suspense fallback={null}>
    {isExpoGo ? <Preview {...props} /> : <LiveJourney {...props} />}
  </Suspense>
}

export function LoginMap(props: ComponentProps<typeof NativeLoginMap>) {
  return <Suspense fallback={null}>
    {isExpoGo ? <Preview decorative /> : <LiveLogin {...props} />}
  </Suspense>
}
