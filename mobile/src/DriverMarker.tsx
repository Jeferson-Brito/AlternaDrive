import { StyleSheet, View } from 'react-native'
import Svg, { Path, Rect } from 'react-native-svg'

export function DriverMarker({ motorcycle, nearby = false }: { motorcycle?: boolean; nearby?: boolean }) {
  return <View collapsable={false} accessible accessibilityLabel={nearby ? (motorcycle ? 'Moto próxima' : 'Carro próximo') : motorcycle ? 'Sua moto' : 'Seu carro'}
    style={nearby ? styles.nearby : styles.marker}>
    <Svg width={nearby ? 17 : 34} height={nearby ? 23 : 46} viewBox="0 0 34 46">
      {motorcycle ? <>
        <Rect x={13} y={2} width={8} height={13} rx={4} fill="#16343c" stroke="#fff" strokeWidth={2} />
        <Rect x={13} y={31} width={8} height={13} rx={4} fill="#16343c" stroke="#fff" strokeWidth={2} />
        <Path d="M9 16h16M17 11v24" stroke="#fff" strokeWidth={7} strokeLinecap="round" />
        <Path d="M9 16h16M17 11v24" stroke="#1488ac" strokeWidth={4} strokeLinecap="round" />
        <Rect x={13} y={20} width={8} height={12} rx={3} fill="#16343c" />
      </> : <>
        <Path d="M6 13v7m22-7v7M6 30v7m22-7v7" stroke="#18343e" strokeWidth={6} strokeLinecap="round" />
        <Path d="M17 3c8 0 11 5 11 11v20c0 6-4 9-11 9S6 40 6 34V14C6 8 9 3 17 3Z"
          fill={nearby ? "#227f69" : "#24a7cc"} stroke="#fff" strokeWidth={2.5} />
        <Path d="M10 16c3-3 11-3 14 0l-2 6H12Zm2 10h10l2 7c-4 2-10 2-14 0Z" fill="#193c4c" />
        <Path d="M11 10l2-1m8 0 2 1" stroke="#e4fbff" strokeWidth={2} strokeLinecap="round" />
        <Path d="M11 37h2m8 0h2" stroke="#c93146" strokeWidth={2} strokeLinecap="round" />
      </>}
    </Svg>
  </View>
}

const styles = StyleSheet.create({
  nearby: { width: 24, height: 28, borderRadius: 12, backgroundColor: '#e1f1e8', alignItems: 'center', justifyContent: 'center' },
  marker: { width: 38, height: 50, alignItems: 'center', justifyContent: 'center' },
})
