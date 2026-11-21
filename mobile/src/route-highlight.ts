import { useEffect, useState } from 'react'
import { AccessibilityInfo, AppState } from 'react-native'

export function useRoutePulse() {
  const [opacity, setOpacity] = useState(0)

  useEffect(() => {
    let alive = true
    let reduced = true
    let timer: ReturnType<typeof setInterval> | undefined

    function sync() {
      clearInterval(timer)
      if (!alive) return
      if (reduced || AppState.currentState !== 'active') { setOpacity(0); return }
      const start = Date.now()
      timer = setInterval(() => {
        const phase = ((Date.now() - start) % 4200) / 4200
        setOpacity(.42 * (1 - Math.cos(2 * Math.PI * phase)) / 2)
      }, 60)
    }

    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', enabled => { reduced = enabled; sync() })
    const visibility = AppState.addEventListener('change', sync)
    void AccessibilityInfo.isReduceMotionEnabled().then(enabled => { reduced = enabled; sync() }).catch(() => undefined)
    return () => { alive = false; clearInterval(timer); motion.remove(); visibility.remove() }
  }, [])

  return opacity
}
