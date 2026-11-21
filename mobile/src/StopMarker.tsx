import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'

export function StopMarker({ count }: { count: number }) {
  const icons = Math.min(count, 6)
  return <View style={styles.badge} accessibilityLabel={count + ' passageiros na parada'}>
    {Array.from({ length: icons }, (_, index) => <Svg key={index} width={12} height={15} viewBox="0 0 12 15">
      <Circle cx={6} cy={3} r={2} fill="#0b5a48" />
      <Path d="M2 13v-3a4 4 0 018 0v3z" fill="#0b5a48" />
    </Svg>)}
    {count > icons && <Text style={styles.count}>+{count - icons}</Text>}
  </View>
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', padding: 3, borderRadius: 7, backgroundColor: '#fff', borderColor: '#9fbbb0', borderWidth: 1 },
  count: { fontSize: 11, color: '#0b5a48', fontWeight: '800' },
})
