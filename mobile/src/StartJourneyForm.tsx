import { GuideTip } from './Tutorial'
import { Pressable, StyleSheet, Switch, View } from 'react-native'
import { NumberField, ui } from './controls'
import type { Dashboard } from './model'
import { money } from './model'
import { Icon } from './operation-ui'
import { Text } from './type'

type Props = {
  defaults: Dashboard['defaults']
  vehicles: Dashboard['vehicles']
  vehicleId: string
  onVehicle: (id: string) => void
  odometer: string
  onOdometer: (value: string) => void
  useCurrent: boolean
  onUseCurrent: (value: boolean) => void
  busy: boolean
}

export function StartJourneyForm({ defaults, vehicles, vehicleId, onVehicle, odometer, onOdometer, useCurrent, onUseCurrent, busy }: Props) {
  return <View style={styles.form}>
    <GuideTip />
    <View style={styles.route}>
      <View style={styles.point}>
        <View style={styles.pin}><Text style={styles.pinText}>A</Text></View>
        <View style={styles.pointDetails}>
          <Text style={styles.caption}>Partida</Text>
          <Text style={styles.address}>{useCurrent ? 'Minha localização atual' : defaults.defaultOrigin}</Text>
        </View>
      </View>
      <View style={styles.connector} />
      <View style={styles.point}>
        <View style={[styles.pin, styles.destinationPin]}><Text style={styles.pinText}>B</Text></View>
        <View style={styles.pointDetails}>
          <Text style={styles.caption}>Destino</Text>
          <Text style={styles.address}>{defaults.defaultDestination}</Text>
        </View>
      </View>
      <View style={styles.routeFooter}>
        <Text style={styles.caption}>Tarifa por passageiro</Text>
        <Text style={styles.address}>{money(defaults.defaultFare)}</Text>
      </View>
    </View>

    <GuideTip step={1} />
    <View style={styles.options}>
      <Text style={ui.label}>Veículo</Text>
      <View style={styles.vehicles} accessibilityRole="radiogroup">
        {vehicles.map(vehicle => {
          const selected = vehicle.id === vehicleId
          return <Pressable key={vehicle.id} accessibilityRole="radio" accessibilityState={{ selected, disabled: busy }}
            disabled={busy} onPress={() => onVehicle(vehicle.id)} style={({ pressed }) => [
              styles.vehicle, selected && styles.selectedVehicle, pressed && ui.dim,
            ]}>
            <Icon name={selected ? 'check' : 'car'} size={17} />
            <Text numberOfLines={2} style={styles.vehicleText}>{vehicle.name}</Text>
          </Pressable>
        })}
      </View>
    </View>

    <GuideTip step={2} />
    <NumberField mode="odometer" label="Hodômetro inicial (km)" value={odometer} onChange={onOdometer}
      hint="Use a quilometragem total que aparece no painel do veículo." />

    <GuideTip step={3} />
    <View style={styles.location}>
      <View style={styles.pointDetails}>
        <Text style={ui.label}>Partir da minha localização</Text>
        <Text style={styles.caption}>Usa sua posição como ponto de partida.</Text>
      </View>
      <Switch accessibilityLabel="Partir da minha localização" value={useCurrent} onValueChange={onUseCurrent} disabled={busy}
        trackColor={{ false: '#cadbd3', true: '#79b9a5' }} thumbColor={useCurrent ? '#0b5a48' : '#fff'} />
    </View>
    <Text style={styles.caption}>Durante a jornada, sua posição aproximada aparece no mapa. Você pode ocultá-la nos controles da jornada.</Text>
  </View>
}

const styles = StyleSheet.create({
  form: { gap: 15 },
  route: { padding: 13, borderRadius: 18, backgroundColor: '#f1f7f4', borderWidth: 1, borderColor: '#dfebe5' },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  pin: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#0b5a48', alignItems: 'center', justifyContent: 'center' },
  destinationPin: { backgroundColor: '#62469d' },
  pinText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  pointDetails: { flex: 1, gap: 1 },
  caption: { color: '#536e63', fontSize: 12 },
  address: { color: '#15382e', fontWeight: '800', fontSize: 15 },
  connector: { width: 2, height: 12, marginLeft: 14, marginVertical: 2, backgroundColor: '#b5cfc3' },
  routeFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#cbded4', paddingTop: 9, marginTop: 11 },
  options: { gap: 6 },
  vehicles: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  vehicle: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44, maxWidth: '100%',
    paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: '#d8e8e0', borderRadius: 12 },
  selectedVehicle: { backgroundColor: '#e4f3eb', borderColor: '#86b9a6' },
  vehicleText: { flexShrink: 1, color: '#15382e', fontWeight: '700' },
  location: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 13, backgroundColor: '#f1f7f4' },
})
