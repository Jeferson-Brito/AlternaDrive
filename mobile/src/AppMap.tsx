import type { ComponentProps } from 'react'
import { isExpoGo } from './environment'
import type { JourneyMap as NativeJourneyMap, LoginMap as NativeLoginMap } from './JourneyMap'

export function JourneyMap(props: ComponentProps<typeof NativeJourneyMap>) {
  if (isExpoGo) {
    const { PreviewMap } = require('./PreviewMap') as typeof import('./PreviewMap')
    return <PreviewMap {...props} />
  }
  const Native = (require('./JourneyMap') as typeof import('./JourneyMap')).JourneyMap
  return <Native {...props} />
}

export function LoginMap(props: ComponentProps<typeof NativeLoginMap>) {
  if (isExpoGo) {
    const { PreviewMap } = require('./PreviewMap') as typeof import('./PreviewMap')
    return <PreviewMap decorative />
  }
  const Native = (require('./JourneyMap') as typeof import('./JourneyMap')).LoginMap
  return <Native {...props} />
}
