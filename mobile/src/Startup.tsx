import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { Text } from './type'

export function Startup({ exiting, onExited }: { exiting: boolean; onExited: () => void }) {
  const progress = useRef(new Animated.Value(0)).current
  const transition = useRef(new Animated.Value(0)).current
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    let alive = true
    const setPreference = (value: boolean) => { if (alive) setReduced(value) }
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setPreference)
    void AccessibilityInfo.isReduceMotionEnabled().then(setPreference).catch(() => undefined)
    return () => { alive = false; listener.remove() }
  }, [])
  useEffect(() => {
    if (reduced || exiting) return
    const animation = Animated.loop(Animated.timing(progress, { toValue: 1, duration: 1250, useNativeDriver: true }))
    animation.start()
    return () => animation.stop()
  }, [progress, exiting, reduced])
  useEffect(() => {
    if (!exiting) return
    if (reduced) { onExited(); return }
    const animation = Animated.timing(transition, {
      toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    })
    animation.start(({ finished }) => { if (finished) onExited() })
    return () => animation.stop()
  }, [transition, exiting, reduced, onExited])

  const barOffset = progress.interpolate({ inputRange: [0, 1], outputRange: [-36, 84] })
  const opacity = transition.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })
  const translateY = transition.interpolate({ inputRange: [0, 1], outputRange: [0, -28] })
  return <Animated.View style={[styles.screen, { opacity, transform: [{ translateY }] }]} accessible accessibilityLabel="Abrindo AlternaDrive">
    <StatusBar style="dark" />
    <View style={styles.center}>
      <Image accessibilityIgnoresInvertColors source={require('../assets/alternadrive.png')} style={styles.logo} />
      <Text style={styles.title}>AlternaDrive</Text>
      <View style={styles.track}>
        <Animated.View style={[styles.progress, { transform: [{ translateX: barOffset }] }]} />
      </View>
    </View>
  </Animated.View>
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f9f6' },
  center: { alignItems: 'center', height: 92, width: '100%' },
  logo: { width: 92, height: 92, borderRadius: 24 },
  title: { position: 'absolute', top: 107, color: '#163c32', fontSize: 30, fontWeight: '800', letterSpacing: -.7 },
  track: { position: 'absolute', top: 161, width: 84, height: 3, borderRadius: 3, overflow: 'hidden', backgroundColor: '#d5e8df' },
  progress: { width: 36, height: 3, borderRadius: 3, backgroundColor: '#2e846e' },
})
