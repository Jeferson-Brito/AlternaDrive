import { useEffect, useRef } from 'react'
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import Svg, { Path } from 'react-native-svg'
import { Text } from './type'

export function Startup() {
  const progress = useRef(new Animated.Value(0)).current
  useEffect(() => {
    let alive = true
    let animation: Animated.CompositeAnimation | undefined
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!alive || reduced) return
      animation = Animated.loop(Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 2200, easing: Easing.linear, useNativeDriver: true }),
        Animated.delay(360),
      ]))
      animation.start()
    }).catch(() => undefined)
    return () => { alive = false; animation?.stop() }
  }, [progress])

  const inputRange = [0, .43, .47, .5, .53, .57, 1]
  const translateX = progress.interpolate({ inputRange, outputRange: [23, 45, 47, 50, 53, 55, 77] })
  const translateY = progress.interpolate({ inputRange, outputRange: [70, 29, 26, 25, 26, 29, 70] })
  const rotate = progress.interpolate({ inputRange, outputRange: ['-62deg', '-62deg', '-40deg', '0deg', '40deg', '62deg', '62deg'] })
  const opacity = progress.interpolate({ inputRange: [0, .9, 1], outputRange: [1, 1, 0] })

  return <View style={styles.screen} accessible accessibilityLabel="Abrindo AlternaDrive">
    <StatusBar style="dark" />
    <View style={styles.center}>
      <View style={styles.mark}>
        <Svg width={100} height={100} viewBox="0 0 100 100">
          <Path d="M23 70 45 29Q50 20 55 29L77 70M35 52h30" fill="none" stroke="#fff" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        <Animated.View style={[styles.arrow, { opacity, transform: [{ translateX }, { translateY }] }]}>
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Svg width={24} height={24} viewBox="0 0 24 24">
              <Path d="M3 12h16m-7-7 7 7-7 7" fill="none" stroke="#10483c" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M3 12h16m-7-7 7 7-7 7" fill="none" stroke="#a4f5d6" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Animated.View>
        </Animated.View>
      </View>
      <Text style={styles.title}>AlternaDrive</Text>
    </View>
  </View>
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f9f6' },
  center: { alignItems: 'center', justifyContent: 'center', width: '100%', height: 100 },
  mark: { width: 100, height: 100, borderRadius: 25, backgroundColor: '#105548' },
  arrow: { position: 'absolute', left: -12, top: -12 },
  title: { position: 'absolute', top: 115, color: '#163c32', fontSize: 30, fontWeight: '800', letterSpacing: -.7 },
})
