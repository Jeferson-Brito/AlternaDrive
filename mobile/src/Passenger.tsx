import { useEffect, useRef, useState } from 'react'
import { AppState, StyleSheet, View } from 'react-native'
import { Text } from './type'
import * as Location from 'expo-location'
import { SafeAreaView } from 'react-native-safe-area-context'
import { api } from './api'
import { JourneyMap } from './AppMap'
import { Button } from './controls'
import type { Point } from './model'
import { clearPassengerPresence, disablePassengerBackground, enablePassengerBackground, passengerBackgroundEnabled,
  sharePassengerFix, type PassengerMap } from './passenger-tracking'
import { isExpoGo } from './environment'
import { useRoadRoute } from './road-route'

export type StopDemand = NonNullable<PassengerMap['stop']> & { count: number }

export function usePassengerDemand(token: string | null, location: Point | null) {
  const [stops, setStops] = useState<StopDemand[]>([])
  const center = useRef(location)
  center.current = location
  useEffect(() => {
    if (!token) { setStops([]); return }
    const abort = new AbortController()
    let pending = false
    async function refresh() {
      if (pending || !center.current || AppState.currentState !== 'active') return
      pending = true
      const { latitude, longitude } = center.current
      try {
        const result = await api<StopDemand[]>('passenger/demand', { latitude, longitude }, token, abort.signal)
        if (!abort.signal.aborted) setStops(result)
      } catch { if (!abort.signal.aborted) setStops([]) }
      finally { pending = false }
    }
    void refresh()
    const timer = setInterval(refresh, 3000)
    return () => { clearInterval(timer); abort.abort() }
  }, [token])
  return stops
}

export function Passenger({ close }: { close: () => void }) {
  const [status, setStatus] = useState('Buscando sua localização…')
  const [data, setData] = useState<PassengerMap>()
  const [background, setBackground] = useState(false)
  const [busy, setBusy] = useState(false)
  const [center, setCenter] = useState<Point>()
  const route = useRoadRoute({ a: null, b: null, active: null, position: null, token: '' })
  useEffect(() => {
    let disposed = false
    let watcher: Location.LocationSubscription | undefined
    let fix: Location.LocationObject | undefined
    let pending = false
    async function refresh() {
      if (disposed || pending || !fix || AppState.currentState !== 'active') return
      pending = true
      try {
        const result = await sharePassengerFix(fix)
        if (disposed) return
        setData(result)
        setStatus(!result ? 'Aguardando uma localização mais precisa…'
          : result.stop ? 'Sua presença está visível nesta parada.' : 'Nenhuma parada atendida em até 150 m.')
      } catch {
        if (!disposed) setStatus('Mapa de passageiros indisponível. Tentando novamente…')
      } finally { pending = false }
    }
    void Location.requestForegroundPermissionsAsync().then(async permission => {
      if (disposed) return
      if (!permission.granted) { setStatus('Permita a localização para detectar as paradas próximas.'); return }
      const preference = await passengerBackgroundEnabled()
      if (disposed) return
      if (!isExpoGo && preference !== 'false') {
        const enabled = await enablePassengerBackground().catch(() => false)
        if (disposed) return
        setBackground(enabled)
      }
      watcher = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 3000 }, location => {
        if (disposed) return
        fix = location
        setCenter(previous => previous ?? location.coords)
        void refresh()
      })
      if (disposed) watcher.remove()
    }).catch(() => { if (!disposed) setStatus('Localização indisponível.') })
    const timer = setInterval(refresh, 3000)
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void refresh() })
    return () => {
      disposed = true
      clearInterval(timer)
      watcher?.remove()
      listener.remove()
      void passengerBackgroundEnabled().then(enabled => {
        if (enabled !== 'true') return clearPassengerPresence()
      }).catch(() => undefined)
    }
  }, [])

  async function toggleBackground() {
    setBusy(true)
    try {
      if (background) {
        await disablePassengerBackground()
        setBackground(false)
      } else {
        const enabled = await enablePassengerBackground()
        setBackground(enabled)
        if (!enabled) setStatus('Permita a localização o tempo todo para detectar paradas com o app fechado.')
      }
    } catch { setStatus('Não foi possível alterar a detecção em segundo plano.') }
    finally { setBusy(false) }
  }

  const next = data?.drivers
    .filter(driver => driver.arrivalSeconds !== undefined)
    .sort((a, b) => a.arrivalSeconds! - b.arrivalSeconds!) ?? []
  return <View style={styles.root}>
    <JourneyMap a={null} b={null} active={null} route={route} following onExplore={() => undefined}
      drivers={data?.drivers ?? []} passengerCenter={center} waitingStop={data?.stop ?? undefined} />
    <SafeAreaView style={styles.overlay} pointerEvents="box-none">
      <View style={styles.card}>
        <Text style={styles.title}>Mapa do passageiro</Text>
        {data?.stop && <Text style={styles.title}>{data.stop.name}</Text>}
        <Text style={styles.body}>{status}</Text>
        <Text style={styles.body}>A localização em segundo plano permite detectar paradas e embarques com o app fechado. Motoristas veem a parada e o total de pessoas esperando.</Text>
        {data && <Text style={styles.body}>Motoristas em jornada na região: {data.drivers.length}</Text>}
        {data?.stop && <Text style={styles.body}>{next.length
          ? 'Chegadas nesta parada · ' + next.slice(0, 3).map(driver => Math.max(1, Math.ceil(driver.arrivalSeconds! / 60)) + ' min').join(' · ')
          : 'Nenhum veículo com chegada prevista nesta parada.'}</Text>}
        {!isExpoGo && <Button secondary disabled={busy}
          title={background ? 'Desativar detecção em segundo plano' : 'Ativar detecção em segundo plano'}
          onPress={() => void toggleBackground()} />}
        <Button secondary title="Voltar" onPress={close} />
      </View>
    </SafeAreaView>
  </View>
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#e9eae8' },
  overlay: { flex: 1, justifyContent: 'flex-end', padding: 14 },
  card: { backgroundColor: 'white', borderRadius: 18, padding: 14, gap: 8 },
  title: { fontWeight: '800', color: '#17362d', fontSize: 17 },
  body: { color: '#3f5f55', fontSize: 14 },
})
