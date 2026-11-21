import { useEffect, useState } from 'react'
import { AccessibilityInfo, AppState } from 'react-native'

export function useRoutePulse(enabled: boolean) {
  const [pulse, setPulse] = useState(0)

  useEffect(() => {
    if (!enabled) { setPulse(0); return }
    let alive = true
    let reduced = false
    let timer: ReturnType<typeof setInterval> | undefined

    function sync() {
      clearInterval(timer)
      if (!alive) return
      if (reduced || (AppState.currentState && AppState.currentState !== 'active')) { setPulse(0); return }
      const start = Date.now()
      timer = setInterval(() => {
        const phase = ((Date.now() - start) % 4200) / 4200
        setPulse((1 - Math.cos(2 * Math.PI * phase)) / 2)
      }, 60)
    }

    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', enabled => { reduced = enabled; sync() })
    const visibility = AppState.addEventListener('change', sync)
    void AccessibilityInfo.isReduceMotionEnabled().then(enabled => { reduced = enabled; sync() }).catch(sync)
    return () => { alive = false; clearInterval(timer); motion.remove(); visibility.remove() }
  }, [enabled])

  const strength = enabled ? pulse : 0
  const red = Math.round(151 + 43 * strength)
  const green = Math.round(99 + 58 * strength)
  const blue = Math.round(241 + 12 * strength)
  return { color: 'rgb(' + red + ',' + green + ',' + blue + ')', width: 5 + 2 * strength }
}
