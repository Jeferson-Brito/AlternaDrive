import { useEffect, useRef } from 'react'
import { StyleSheet, View, type GestureResponderEvent } from 'react-native'
import type { Point } from './model'

export function MapPencil({ locate, onPoint }: {
  locate: (x: number, y: number) => Promise<Point | undefined>
  onPoint: (point: Point, stroke: symbol) => void
}) {
  const queued = useRef<{ x: number; y: number; stroke: symbol } | undefined>(undefined)
  const stroke = useRef(Symbol())
  const running = useRef(false)

  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; queued.current = undefined }
  }, [])

  function trace(event: GestureResponderEvent) {
    queued.current = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY, stroke: stroke.current }
    if (running.current) return
    running.current = true
    void (async () => {
      try {
        while (queued.current) {
          const { x, y, stroke } = queued.current
          queued.current = undefined
          const point = await locate(x, y)
          if (point && mounted.current) onPoint(point, stroke)
        }
      } finally { running.current = false }
    })().catch(() => undefined)
  }

  return <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true}
    onResponderGrant={event => { stroke.current = Symbol(); trace(event) }} onResponderMove={trace} onResponderRelease={trace} />
}
