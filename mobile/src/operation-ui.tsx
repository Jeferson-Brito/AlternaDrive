import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from './type'
import Svg, { Path } from 'react-native-svg'

const shapes = {
  right: 'm9 6 6 6-6 6',
  profile: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  car: 'm4 11 2-5h12l2 5M5 17v2m14-2v2M7 14h1m8 0h1M4 11h16a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Z',
  exit: 'M10 4H5v16h5m4-12 4 4-4 4m-5-4h9',
  menu: 'M4 6h16M4 12h16M4 18h16',
  activity: 'M3 12h4l3-7 4 14 3-7h4',
  chart: 'M3 3v18h18M7 15l4-5 4 3 5-6',
  eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  eyeOff: 'M3 3l18 18M10 6a11 11 0 0 1 2 0c6.5 0 10 6 10 6a16 16 0 0 1-3 3m-3 2a10 10 0 0 1-4 1c-6.5 0-10-6-10-6a16 16 0 0 1 4-4',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  down: 'm6 9 6 6 6-6',
  up: 'm6 15 6-6 6 6',
  users: 'M15 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m19 0v-2a4 4 0 0 0-3-4M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm4-4a4 4 0 0 1 0 8',
  fuel: 'M3 22h12M5 22V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v18M5 10h8m0 2h2a2 2 0 0 1 2 2v4a2 2 0 0 0 4 0V9l-3-3',
  flag: 'M4 22V3c6-6 10 5 16 0v12c-6 5-10-6-16 0',
  route: 'M4 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0Zm12-10a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM8 17h8a3 3 0 0 0 0-6H8a2 2 0 0 1 0-4h8',
  receipt: 'M5 3v18l3-2 4 2 4-2 3 2V3l-3 2-4-2-4 2-3-2ZM9 9h6m-6 4h6',
} as const
export type IconName = keyof typeof shapes

export function Icon({ name, color = '#174037', size = 20 }: { name: IconName; color?: string; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" pointerEvents="none">
    <Path d={shapes[name]} stroke={color} fill="none" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
}

export function IconButton({ icon, label, onPress, dark, disabled }: {
  icon: IconName; label: string; onPress: () => void; dark?: boolean; disabled?: boolean
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.icon, dark && styles.dark, (pressed || disabled) && styles.dim]}>
    <Icon name={icon} color={dark ? '#e4f3ee' : undefined} />
  </Pressable>
}

export function Shortcut({ icon, text, onPress, danger }: { icon: IconName; text: string; onPress: () => void; danger?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.shortcut, danger && styles.danger, pressed && styles.dim]}>
    <Icon name={icon} color={danger ? '#a42c24' : undefined} />
    <Text style={[styles.caption, danger && styles.dangerText]}>{text}</Text>
  </Pressable>
}

export function MenuRow({ icon, label, onPress, disabled }: {
  icon: IconName; label: string; onPress: () => void; disabled?: boolean
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.menuRow, pressed && styles.menuPressed]}>
    <View style={styles.menuIcon}><Icon name={icon} size={19} /></View>
    <Text style={styles.menuLabel}>{label}</Text>
    <Icon name="right" size={16} color="#6b8279" />
  </Pressable>
}

export function Metric({ label, value, dark }: { label: string; value: string | number; dark?: boolean }) {
  return <View style={[styles.metric, dark && styles.metricDark]}>
    <Text style={[styles.metricLabel, dark && styles.metricLabelDark]}>{label}</Text>
    <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.metricValue, dark && styles.metricValueDark]}>{value}</Text>
  </View>
}

const styles = StyleSheet.create({
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 55, paddingHorizontal: 10, paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e1ece6' },
  menuPressed: { backgroundColor: '#edf5f1' },
  menuIcon: { width: 35, height: 35, borderRadius: 11, backgroundColor: '#e9f3ee', alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, color: '#16362d', fontWeight: '800', fontSize: 15 },
  icon: { minWidth: 42, minHeight: 42, borderRadius: 12, backgroundColor: '#edf4f0', alignItems: 'center', justifyContent: 'center' },
  dark: { backgroundColor: '#275247' },
  dim: { opacity: .65 },
  shortcut: { flex: 1, minWidth: 68, minHeight: 62, padding: 6, gap: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#d2e3db', borderRadius: 13, backgroundColor: '#edf5f1' },
  caption: { textAlign: 'center', fontWeight: '700', color: '#174037', fontSize: 12 },
  danger: { backgroundColor: '#fff1ef', borderColor: '#f4d1cd' },
  dangerText: { color: '#a42c24' },
  metric: { flex: 1, minWidth: 0, gap: 4, paddingLeft: 8, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: '#d7e6df' },
  metricDark: { borderLeftColor: '#456b61' },
  metricLabel: { color: '#546a61', fontSize: 11, fontWeight: '600' },
  metricLabelDark: { color: '#c1dbd1' },
  metricValue: { color: '#142d24', fontSize: 15, fontWeight: '800' },
  metricValueDark: { color: '#fff' },
})
