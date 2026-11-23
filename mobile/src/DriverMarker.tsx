import { StyleSheet, View } from 'react-native'
import { defaultCarColor } from '../../src/car-colors'
import Svg, { Defs, Ellipse, LinearGradient, Path, Rect, Stop } from 'react-native-svg'

export function DriverMarker({ motorcycle, nearby = false, carColor, scale = 1 }: { motorcycle?: boolean; nearby?: boolean; carColor?: string | null; scale?: number }) {
  return <View collapsable={false} accessible accessibilityLabel={nearby ? (motorcycle ? 'Moto próxima' : 'Carro próximo') : motorcycle ? 'Sua moto' : 'Seu carro'}
    style={nearby ? styles.nearby : styles.marker}>
    <Svg width={(nearby ? 24 : 39) * scale} height={(nearby ? 32 : 52) * scale} viewBox="0 0 44 60">
      <Defs>
        <LinearGradient id="paintHighlight" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#fff" stopOpacity=".50" />
          <Stop offset="46%" stopColor="#fff" stopOpacity=".11" />
          <Stop offset="82%" stopColor="#0b2128" stopOpacity=".19" />
          <Stop offset="100%" stopColor="#0b2128" stopOpacity=".43" />
        </LinearGradient>
        <LinearGradient id="windshield" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#68909e" />
          <Stop offset="48%" stopColor="#254857" />
          <Stop offset="100%" stopColor="#142c36" />
        </LinearGradient>
      </Defs>
      <Ellipse cx={22} cy={32} rx={19} ry={26} fill="#18382f" opacity={.16} />
      {motorcycle ? <>
        <Path d="M22 4c4 0 6 3 6 7v7l5 3v5l-6 2v11c1 3 2 5 2 9v3c0 4-3 6-7 6s-7-2-7-6v-3c0-4 1-6 2-9V28l-6-2v-5l5-3v-7c0-4 2-7 6-7Z"
          fill="#182d34" stroke="#fff" strokeWidth={2.3} />
        <Rect x={19} y={6} width={6} height={13} rx={3} fill="#304952" />
        <Rect x={19} y={44} width={6} height={10} rx={3} fill="#304952" />
        <Path d="M15 21 19 17h6l4 4-3 10v9l-4 5-4-5v-9Z" fill="#24a7cc" />
        <Path d="M17 23h10l-2 6h-6Z" fill="url(#windshield)" stroke="#9cbdc6" strokeWidth={.8} />
        <Rect x={19} y={31} width={6} height={8} rx={2.5} fill="#142c36" />
        <Path d="M13 22h3m12 0h3M20 18h4" fill="none" stroke="#effbff" strokeWidth={2} strokeLinecap="round" />
        <Path d="M20 44h4" stroke="#fd6063" strokeWidth={2} strokeLinecap="round" />
      </> : <>
        <Path d="M8 13v11m28-11v11M8 39v10m28-10v10" stroke="#17272e" strokeWidth={5} strokeLinecap="round" />
        <Path d="m9 24-3 1v5l4-1m25-5 3 1v5l-4-1" fill="#223941" stroke="#fff" strokeWidth={1.5} strokeLinejoin="round" />
        <Path d="M22 4c9 0 13 5 14 11l1 8-1 22c0 8-4 11-14 11S8 53 8 45L7 23l1-8C9 9 13 4 22 4Z"
          fill={carColor ?? defaultCarColor} stroke="#fff" strokeWidth={2.4} />
        <Path d="M22 5c8 0 12 4 13 10l1 8-1 22c0 7-4 10-13 10S9 52 9 45L8 23l1-8C10 9 14 5 22 5Z" fill="url(#paintHighlight)" />
        <Path d="M13 18c5-3 13-3 18 0l-2 7H15Zm2 17h14l3 8c-6 3-14 3-20 0Z" fill="url(#windshield)" stroke="#162f38" strokeWidth={1} strokeLinejoin="round" />
        <Path d="m12 22 2 5v7l-2 5Zm20 0-2 5v7l2 5Z" fill="#203f4f" opacity={.9} />
        <Path d="M16 19c3-1 6-1 10-1M13 12l4-2m10 0 4 2" fill="none" stroke="#edfbff" strokeWidth={2} strokeLinecap="round" />
        <Path d="M12 49l4 2m12 0 4-2" stroke="#90232d" strokeWidth={3.6} strokeLinecap="round" />
        <Path d="M12 48.5l4 2m12 0 4-2" stroke="#ff7980" strokeWidth={1.9} strokeLinecap="round" />
        <Path d="M19 52h6" stroke="#253841" strokeWidth={1.5} strokeLinecap="round" />
      </>}
    </Svg>
  </View>
}

export function vehicleMarkerScale(zoom: number) {
  // Quantize pinch updates so the native marker is not redrawn for every frame.
  return Math.round(Math.max(.40, Math.min(1, .40 + (zoom - 11) * .10)) * 20) / 20
}

const styles = StyleSheet.create({
  nearby: { width: 28, height: 36, alignItems: 'center', justifyContent: 'flex-end' },
  marker: { width: 43, height: 56, alignItems: 'center', justifyContent: 'flex-end' },
})
