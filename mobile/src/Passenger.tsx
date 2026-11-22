import { useEffect, useRef, useState } from 'react'
import { AppState, StyleSheet, View } from 'react-native'
import { Text } from './type'
import * as Location from 'expo-location'
import { SafeAreaView } from 'react-native-safe-area-context'
import { api } from './api'
import { JourneyMap } from './AppMap'
import { Button } from './controls'
import type { Point } from './model'
import type { NearbyDriver } from './nearby-drivers'
import { useRoadRoute } from './road-route'

type Stop = Point & { id: string; name: string }
export type StopDemand = Stop & { count: number }
type PassengerMap = { stop: Stop | null; session: string; drivers: NearbyDriver[] }

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
  const [center, setCenter] = useState<Point>()
  const route = useRoadRoute({ a: null, b: null, active: null, position: null, token: '' })
  useEffect(() => {
    let disposed = false
    let watcher: Location.LocationSubscription | undefined
    let fix: Location.LocationObject | undefined
    let session: string | undefined
    let pending = false
    let epoch = 0
    function hide(id: string) { void api('passenger/hide', { session: id }).catch(() => undefined) }
    async function refresh() {
      if (disposed || pending || !fix || AppState.currentState !== 'active') return
      const { latitude, longitude, accuracy } = fix.coords
      if (Date.now() - fix.timestamp > 30_000 || (accuracy ?? Infinity) > 50) {
        if (session) { hide(session); session = undefined }
        setData(undefined)
        setStatus('Aguardando uma localização mais precisa…')
        return
      }
      pending = true
      const requestEpoch = epoch
      try {
        const result = await api<PassengerMap>('passenger/map', { session, position: { latitude, longitude } },
          null, AbortSignal.timeout ? AbortSignal.timeout(13_000) : undefined)
        if (disposed || requestEpoch !== epoch) { hide(result.session); return }
        session = result.session
        setData(result)
        setStatus(result.stop ? 'Sua presença está visível nesta parada.' : 'Nenhuma parada atendida em até 150 m.')
      } catch { if (!disposed && requestEpoch === epoch) { setData(undefined); setStatus('Mapa de passageiros indisponível. Tentando novamente…') } }
      finally { pending = false }
    }
    void Location.requestForegroundPermissionsAsync().then(async permission => {
      if (disposed) return
      if (!permission.granted) { setStatus('Permita a localização para detectar as paradas próximas.'); return }
      watcher = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 3000 }, location => {
        if (disposed) return
        fix = location
        setCenter(previous => previous ?? location.coords)
        void refresh()
      })
      if (disposed) watcher.remove()
    }).catch(() => { if (!disposed) setStatus('Localização indisponível.') })
    const timer = setInterval(refresh, 3000)
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') { void refresh(); return }
      epoch++
      fix = undefined
      if (session) { hide(session); session = undefined }
      setData(undefined)
    })
    return () => {
      disposed = true
      clearInterval(timer)
      watcher?.remove()
      listener.remove()
      if (session) hide(session)
    }
  }, [])

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
        <Text style={styles.body}>Motoristas veem a parada e o número de pessoas esperando.</Text>
        {data && <Text style={styles.body}>Motoristas em jornada na região: {data.drivers.length}</Text>}
        {data?.stop && <Text style={styles.body}>{next.length
          ? 'Chegadas nesta parada · ' + next.slice(0, 3).map(driver => Math.max(1, Math.ceil(driver.arrivalSeconds! / 60)) + ' min').join(' · ')
          : 'Nenhum veículo com chegada prevista nesta parada.'}</Text>}
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
