import { StyleSheet, View } from 'react-native'
import { Text } from './type'
import { Address, Button, NumberField } from './controls'
import { numeric, type Place } from './model'

export function RouteForm({ token, origin, destination, fare, onOrigin, onDestination, onFare, busy, onSave }: {
  token: string
  origin: Place | null
  destination: Place | null
  fare: string
  onOrigin: (place: Place | null) => void
  onDestination: (place: Place | null) => void
  onFare: (value: string) => void
  busy: boolean
  onSave: () => void
}) {
  return <View style={styles.form}>
    <View style={styles.points}>
      <View style={styles.point}>
        <View style={styles.rail} accessible={false}>
          <Text style={[styles.pin, styles.origin]}>A</Text>
          <View style={styles.connector} />
        </View>
        <View style={styles.field}>
          <Address token={token} label="Origem · Ponto A" placeholder="Digite o endereço de partida"
            value={origin} onChange={onOrigin} />
        </View>
      </View>
      <View style={styles.point}>
        <View style={styles.rail} accessible={false}>
          <Text style={[styles.pin, styles.destination]}>B</Text>
        </View>
        <View style={styles.field}>
          <Address token={token} label="Destino · Ponto B" placeholder="Digite o endereço de chegada"
            value={destination} onChange={onDestination} />
        </View>
      </View>
    </View>
    <View style={styles.fare}>
      <NumberField mode="money" label="Tarifa por passageiro" value={fare} onChange={onFare} />
    </View>
    <Button title={busy ? 'Salvando…' : 'Salvar percurso e tarifa'}
      disabled={busy || !origin || !destination || !(numeric(fare) > 0)} onPress={onSave} />
  </View>
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  points: { borderWidth: 1, borderColor: '#dce9e2', borderRadius: 16, backgroundColor: '#f6faf8', padding: 12 },
  point: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  rail: { width: 25, alignItems: 'center', paddingTop: 1 },
  pin: { width: 25, height: 25, lineHeight: 25, textAlign: 'center', borderRadius: 13, overflow: 'hidden', fontWeight: '800', fontSize: 12 },
  origin: { backgroundColor: '#d8ede3', color: '#0b5a48' },
  destination: { backgroundColor: '#e9e1f9', color: '#51329a' },
  connector: { width: 2, flex: 1, minHeight: 18, backgroundColor: '#c1d5cd', marginTop: 3, marginBottom: 2 },
  field: { flex: 1, minWidth: 0, paddingBottom: 10 },
  fare: { borderWidth: 1, borderColor: '#dce9e2', borderRadius: 16, backgroundColor: '#f6faf8', padding: 12 },
})
