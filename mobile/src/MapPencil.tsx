import { useEffect, useRef } from 'react'
import { StyleSheet, View, type GestureResponderEvent } from 'react-native'
import type { Point } from './model'

export function MapPencil({ locate, onPoint }: {
  locate: (x: number, y: number) => Promise<Point | undefined>
  onPoint: (point: Point) => void
}) {
  const queued = useRef<{ x: number; y: number } | undefined>(undefined)
  const running = useRef(false)

  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; queued.current = undefined }
  }, [])

  function trace(event: GestureResponderEvent) {
    queued.current = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY }
    if (running.current) return
    running.current = true
    void (async () => {
      try {
        while (queued.current) {
          const { x, y } = queued.current
          queued.current = undefined
          const point = await locate(x, y)
          if (point && mounted.current) onPoint(point)
        }
      } finally { running.current = false }
    })().catch(() => undefined)
  }

  return <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true}
    onResponderGrant={trace} onResponderMove={trace} onResponderRelease={trace} />
}
