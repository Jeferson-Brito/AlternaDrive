import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, AppState, Image, Keyboard, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Location from 'expo-location'
import * as SecureStore from 'expo-secure-store'
import { StatusBar } from 'expo-status-bar'
import { api, ApiError, authenticate, clearSession, readSession } from './src/api'
import { Address, Button, Field, NumberField, ui } from './src/controls'
import { JourneyMap, LoginMap } from './src/AppMap'
import { isExpoGo } from './src/environment'
import { VehicleForm } from './src/VehicleForm'
import { Icon, IconButton, Metric, Shortcut } from './src/operation-ui'
import { Report } from './src/Report'
import { useRoadRoute } from './src/road-route'
import { type Closing, type Dashboard, type Place, money, numeric } from './src/model'
import { onArrival, recordForegroundLocation, startTracking, stopTracking } from './src/tracking'
import { workDuration } from '../src/journey-time'

type Panel = 'report' | 'menu' | 'route' | 'vehicle' | 'start' | 'group' | 'finish' | 'fuel' | 'expense'
const titles: Record<Panel, string> = {
  report: 'Lucro por dia', menu: 'Menu da operação', route: 'Percurso e tarifa', vehicle: 'Cadastrar veículo', start: 'Iniciar jornada',
  group: 'Registrar grupo', finish: 'Finalizar jornada', fuel: 'Abastecimento', expense: 'Registrar despesa',
}

function Brand() {
  return <View style={styles.brandRow}>
    <Image accessibilityIgnoresInvertColors source={require('./assets/alternadrive.png')} style={styles.brandIcon} />
    <Text style={styles.brand}>AlternaDrive</Text>
  </View>
}

function Operation() {
  const { bottom } = useSafeAreaInsets()
  const [token, setToken] = useState<string | null>(null)
  const [data, setData] = useState<Dashboard | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const gate = useRef(false)
  const [register, setRegister] = useState(false)
  const [visiblePassword, setVisiblePassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [panel, setPanel] = useState<Panel | null>(null)
  const [period, setPeriod] = useState('month')
  const [hide, setHide] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [position, setPosition] = useState<Location.LocationObject | null>(null)
  const [gpsStatus, setGpsStatus] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const [pointA, setPointA] = useState<Place | null>(null)
  const [pointB, setPointB] = useState<Place | null>(null)
  const [useCurrent, setUseCurrent] = useState(false)

  const reload = useCallback(async (session: string) => {
    try {
      const dashboard = await api<Dashboard>('dashboard', undefined, session)
      setData(dashboard)
      return dashboard
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) {
        await stopTracking().catch(() => undefined)
        await clearSession()
        setToken(null)
        setData(null)
      }
      throw failure
    }
  }, [])

  async function run(action: () => Promise<void>) {
    if (gate.current) return
    gate.current = true
    setError('')
    setBusy(true)
    try { await action() }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Tente novamente.') }
    finally { setBusy(false); gate.current = false }
  }

  useEffect(() => {
    void Promise.all([readSession(), SecureStore.getItemAsync('alternadrive.hide-finances').catch(() => null)]).then(async ([saved, privacy]) => {
      setHide(privacy === 'true')
      setToken(saved)
      if (saved) await reload(saved)
    }).catch(failure => setError(failure.message)).finally(() => setReady(true))
  }, [reload])

  useEffect(() => {
    if (!token) return
    const refresh = () => { void reload(token).catch(() => undefined) }
    const remove = onArrival(refresh)
    const resume = AppState.addEventListener('change', value => { if (value === 'active') refresh() })
    return () => { remove(); resume.remove() }
  }, [token, reload])

  const active = data?.active
  const activeId = active?.id
  const routeA = active?.pointA ?? data?.defaults.defaultPointA ?? null
  const routeB = active?.pointB ?? data?.defaults.defaultPointB ?? null
  const route = useRoadRoute({ a: routeA, b: routeB, active: active ?? null, position, token: token ?? '' })

  function toggleFinancePrivacy() {
    const next = !hide
    setHide(next)
    void SecureStore.setItemAsync('alternadrive.hide-finances', String(next)).catch(() => undefined)
  }
  useEffect(() => { setExpanded(false) }, [activeId])
  useEffect(() => {
    if (!activeId) { setPosition(null); return }
    let watcher: Location.LocationSubscription | undefined
    let cancelled = false
    void Location.getForegroundPermissionsAsync().then(async permission => {
      if (!permission.granted || cancelled) return
      watcher = await Location.watchPositionAsync({
        accuracy: Location.Accuracy.High, distanceInterval: 8, timeInterval: 3000,
      }, location => {
        if (cancelled) return
        setPosition(location)
        recordForegroundLocation(location)
      })
      if (cancelled) watcher.remove()
    }).catch(() => { if (!cancelled) setGpsStatus('GPS indisponível.') })
    return () => { cancelled = true; watcher?.remove() }
  }, [activeId, gpsStatus])

  async function enableTracking(journey: NonNullable<Dashboard['active']>) {
    try {
      const tracking = await startTracking(journey)
      setGpsStatus(tracking === 'denied' ? 'Permita o acesso à localização para acompanhar a jornada.'
        : tracking === 'background' ? 'GPS em segundo plano ativo'
        : isExpoGo ? 'GPS ativo com o app aberto' : 'Permita a localização em segundo plano para acompanhar com a tela bloqueada.')
    } catch {
      setGpsStatus('GPS em segundo plano indisponível. Você pode tentar ativá-lo novamente.')
    }
  }

  function show(next: Panel | null) {
    Keyboard.dismiss()
    setPanel(next)
    setError('')
    setFirst(next === 'route' && data?.defaults.defaultFare ? (data.defaults.defaultFare / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')
    setSecond('')
    setUseCurrent(false)
    if (next === 'route' && data) {
      const defaults = data.defaults
      setPointA(defaults.defaultPointA && defaults.defaultOrigin ? { ...defaults.defaultPointA, label: defaults.defaultOrigin } : null)
      setPointB(defaults.defaultPointB && defaults.defaultDestination ? { ...defaults.defaultPointB, label: defaults.defaultDestination } : null)
    }
    if (next === 'start' || next === 'fuel') setVehicleId(active?.vehicleId ?? data?.vehicles[0]?.id ?? '')
  }

  async function save(path: string, body: object) {
    if (!token) return
    await api(path, body, token)
    show(null)
    await reload(token)
  }

  async function begin() {
    if (!token) return
    let currentLocation
    if (useCurrent) {
      if (!(await Location.requestForegroundPermissionsAsync()).granted) throw new Error('Autorize o GPS para usar a localização atual.')
      const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      currentLocation = { latitude: coords.latitude, longitude: coords.longitude, address: 'Localização atual' }
    }
    await api('journeys', { vehicleId, startKm: numeric(first), currentLocation }, token)
    show(null)
    const dashboard = await reload(token)
    if (dashboard.active) await enableTracking(dashboard.active)
  }

  async function finish() {
    if (!active || !token) return
    const { closing } = await api<{ closing: Closing }>('journeys/' + active.id + '/finish', { km: numeric(first) }, token)
    await stopTracking().catch(() => undefined)
    setData(previous => previous ? { ...previous, active: null } : previous)
    setGpsStatus('')
    show(null)
    Alert.alert('Jornada finalizada', [
      workDuration(closing.startedAt, closing.endedAt), closing.distance.toLocaleString('pt-BR') + ' km',
      'Receita ' + (hide ? '••••' : money(closing.revenue)), 'Lucro estimado ' + (hide ? '••••' : money(closing.profit)),
    ].join('\n'))
    await reload(token)
  }

  const secureError = !!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
  if (!ready || !token || !data) return <View style={styles.root}>
    <LoginMap bottomInset={bottom} />
    <SafeAreaView pointerEvents="box-none" style={styles.login}>
      <KeyboardAvoidingView behavior="padding" style={styles.keyboard}>
        <ScrollView contentContainerStyle={styles.loginBody} keyboardShouldPersistTaps="handled">
          <View style={styles.loginCard}>
            <Brand />
            <Text style={styles.title}>{!ready ? 'Carregando…' : token ? 'Conectando à sua conta' : register ? 'Criar conta' : 'Entre na sua conta'}</Text>
            {secureError}
            {ready && (token ? <Button title="Tentar novamente" disabled={busy} onPress={() => void run(async () => { await reload(token) })} /> : <>
              {register && <Field label="Nome" value={name} onChangeText={setName} />}
              <Field label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              <Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry={!visiblePassword} autoCapitalize="none"
                trailing={<IconButton icon={visiblePassword ? 'eyeOff' : 'eye'}
                  label={visiblePassword ? 'Ocultar senha' : 'Mostrar senha'} onPress={() => setVisiblePassword(!visiblePassword)} />} />
              <Button title={register ? 'Cadastrar' : 'Entrar'} disabled={busy} onPress={() => void run(async () => {
                const session = await authenticate(register ? 'register' : 'login', register ? { email, password, name } : { email, password })
                setPassword('')
                setToken(session)
                await reload(session)
              })} />
              <Button secondary title={register ? 'Já tenho conta' : 'Criar conta'} onPress={() => { setRegister(!register); setError('') }} />
            </>)}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </View>

  const stats = data.summaries.find(item => item.period === (active ? 'day' : period))
  const destination = active ? (active.arrivals % 2 ? active.origin : active.destination) : data.defaults.defaultDestination
  const statsContent = <>
    <Metric label="Embarques" value={stats?.passengers ?? 0} dark={Boolean(active)} />
    <Metric label="Receita" value={hide ? '••••' : money(stats?.revenue ?? 0)} dark={Boolean(active)} />
    <Metric label="Lucro est." value={hide ? '••••' : money(stats?.profit ?? null)} dark={Boolean(active)} />
  </>
  const vehicles = data.vehicles.map(vehicle => <Button key={vehicle.id} secondary={vehicle.id !== vehicleId}
    title={vehicle.name} onPress={() => setVehicleId(vehicle.id)} />)
  const submit = (title: string, action: () => Promise<void>, invalid = false) =>
    <Button title={busy ? 'Aguarde…' : title} disabled={busy || invalid} onPress={() => void run(action)} />
  const cents = (input: string) => Math.round(numeric(input) * 100)
  const minPrice = (input: string) => numeric(input) > 0

  return <View style={styles.root}>
    <JourneyMap a={routeA} b={routeB} active={active ?? null} route={route} />
    <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
      {active ? <View style={styles.stats}>
        {statsContent}
        <IconButton dark icon={hide ? 'eyeOff' : 'eye'} label={hide ? 'Exibir valores' : 'Ocultar valores'} onPress={toggleFinancePrivacy} />
      </View> : <View style={styles.cardRow}><Brand />
        <View style={styles.headerActions}>
          <IconButton icon="activity" label="Resumo financeiro" onPress={() => show('report')} />
          <IconButton icon="menu" label="Menu da operação" onPress={() => show('menu')} />
        </View>
      </View>}
      <View style={styles.card}>
        {!!error && !panel && secureError}
        {active ? <>
          <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Recolher ações' : 'Expandir ações'}
            accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.drawer}>
            <View style={styles.grip} />
            <View style={styles.destinationRow}>
              <View style={styles.destination}>
                <Text style={styles.label}>{'Próximo destino · Ponto ' + (active.arrivals % 2 ? 'A' : 'B')}</Text>
                <Text numberOfLines={1} style={ui.muted}>{destination}</Text>
              </View>
              <Icon name={expanded ? 'down' : 'up'} />
            </View>
          </Pressable>
          {route.estimate && <View style={styles.estimate}>
            <Text style={styles.estimateText}>{Math.ceil(route.estimate.seconds / 60)} min</Text>
            <Text style={styles.estimateText}>às {new Date(Date.now() + route.estimate.seconds * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>
            <Text style={styles.estimateText}>{(route.estimate.meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km</Text>
          </View>}
          <Pressable accessibilityRole="button" disabled={busy} accessibilityLabel={'Registrar passageiro por ' + money(active.fare)}
            style={({ pressed }) => [ui.button, styles.passenger, (pressed || busy) && ui.dim]}
            onPress={() => void run(async () => {
              await api('journeys/' + active.id + '/boardings', { count: 1 }, token)
              await reload(token)
            })}>
            <Icon name="plus" color="#fff" size={24} />
            <Text style={ui.buttonText}>Passageiro</Text>
            <Text style={styles.fareBadge}>{money(active.fare)}</Text>
          </Pressable>
          {expanded && <>
            {!!gpsStatus && <Text style={ui.muted}>{gpsStatus}</Text>}
            <Text style={ui.muted}>Tempo trabalhado · {workDuration(active.startedAt, Date.now())}</Text>
            <View style={styles.actionRow}>
              {active.vehicle.type !== 'motorcycle' && <Shortcut icon="users" text="Grupo" onPress={() => show('group')} />}
              <Shortcut icon="fuel" text="Abastecer" onPress={() => show('fuel')} />
              <Shortcut icon="receipt" text="Despesa" onPress={() => show('expense')} />
              <Shortcut icon="flag" text="Finalizar" danger onPress={() => show('finish')} />
            </View>
            {!isExpoGo && gpsStatus !== 'GPS em segundo plano ativo' && <Button secondary title="Ativar GPS em segundo plano"
              disabled={busy} onPress={() => void run(() => enableTracking(active))} />}
          </>}
        </> : <>
          <Text style={styles.label}>Sem jornada ativa</Text>
          <View style={styles.periodRow}>
            <View style={styles.segment}>
              {[['day', 'Hoje'], ['month', 'Mês']].map(([key, label]) => <Pressable key={key} accessibilityRole="button"
                accessibilityState={{ selected: period === key }} onPress={() => setPeriod(key)}
                style={[styles.segmentButton, period === key && styles.segmentSelected]}>
                <Text style={styles.segmentLabel}>{label}</Text>
              </Pressable>)}
            </View>
            <IconButton icon="chart" label="Abrir gráfico de lucro por dia" onPress={() => show('report')} />
          </View>
          <View style={styles.idleStats}>{statsContent}</View>
          <Button title={data.vehicles.length ? 'Iniciar jornada' : 'Cadastrar primeiro veículo'}
            onPress={() => show(!data.vehicles.length ? 'vehicle' : !data.defaults.defaultPointA ? 'route' : 'start')} />
        </>}
      </View>
    </SafeAreaView>

    <Modal visible={panel !== null} transparent animationType="slide" onRequestClose={() => { if (!busy) show(null) }}>
      <SafeAreaView style={styles.modalBase} edges={['top', 'bottom']}>
        <KeyboardAvoidingView behavior="padding" style={styles.sheetKeyboard}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}><Text style={styles.title}>{panel && titles[panel]}</Text><IconButton icon="close" label="Fechar" disabled={busy} onPress={() => show(null)} /></View>
            <ScrollView key={panel} style={styles.scroll} contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              {secureError}
              {panel === 'report' && <Report token={token} />}
              {panel === 'menu' && <>
                <Button secondary title="Lucro por dia" onPress={() => show('report')} />
                <Button secondary title="Percurso e tarifa" onPress={() => show('route')} />
                <Button secondary title="Cadastrar veículo" onPress={() => show('vehicle')} />
                {!!data.vehicles.length && <Button secondary title="Abastecimento" onPress={() => show('fuel')} />}
                <Button secondary title="Registrar despesa" onPress={() => show('expense')} />
                {submit('Sair', async () => {
                  await api('logout', {}, token)
                  await stopTracking().catch(() => undefined)
                  await clearSession()
                  show(null)
                  setToken(null)
                  setData(null)
                })}
              </>}
              {panel === 'route' && <>
                <Address token={token} label="Ponto A" value={pointA} onChange={setPointA} />
                <Address token={token} label="Ponto B" value={pointB} onChange={setPointB} />
                <NumberField mode="money" label="Tarifa por passageiro (R$)" value={first} onChange={setFirst} />
                {submit('Salvar percurso', () => save('settings/journey', {
                  defaultOrigin: pointA?.label, defaultDestination: pointB?.label,
                  defaultPointA: pointA, defaultPointB: pointB, defaultFare: cents(first),
                }), !pointA || !pointB || !minPrice(first))}
              </>}
              {panel === 'vehicle' && <VehicleForm busy={busy} save={vehicle => void run(() => save('vehicles', vehicle))} />}
              {(panel === 'start' || panel === 'fuel') && <><Text style={styles.label}>Veículo</Text>{vehicles}</>}
              {panel === 'start' && <>
                <View style={styles.routePreview}>
                  <Text style={ui.muted}>Ponto A · Origem</Text>
                  <Text style={styles.label}>{data.defaults.defaultOrigin}</Text>
                  <Text style={ui.muted}>Ponto B · Destino</Text>
                  <Text style={styles.label}>{data.defaults.defaultDestination}</Text>
                  <Text style={ui.muted}>Tarifa por passageiro · {money(data.defaults.defaultFare)}</Text>
                </View>
                <NumberField label="Hodômetro inicial (km)" value={first} onChange={setFirst} />
                <Text style={ui.muted}>Informe a quilometragem total exibida no painel.</Text>
                <Button secondary={!useCurrent} title={useCurrent ? '✓ Usar localização atual' : 'Usar localização atual'} onPress={() => setUseCurrent(!useCurrent)} />
                {submit('Iniciar jornada', begin, !vehicleId || !Number.isInteger(numeric(first)))}
              </>}
              {panel === 'group' && <>
                <NumberField label="Número de passageiros" value={first} onChange={setFirst} />
                {submit('Registrar grupo', () => save('journeys/' + active?.id + '/boardings', { count: numeric(first) }), !Number.isInteger(numeric(first)) || !minPrice(first))}
              </>}
              {panel === 'finish' && <>
                <NumberField label="Hodômetro final (km)" value={first} onChange={setFirst} />
                {submit('Confirmar encerramento', finish, !Number.isInteger(numeric(first)) || numeric(first) < (active?.startKm ?? 0))}
              </>}
              {panel === 'fuel' && <>
                <NumberField mode="money" label="Total pago (R$)" value={first} onChange={setFirst} />
                <NumberField mode="money" label="Preço por litro ou m³ (R$)" value={second} onChange={setSecond} />
                {submit('Salvar abastecimento', () => save('entries', { kind: 'fuel', vehicleId, amount: cents(first), fuelUnitPrice: cents(second) }),
                  !vehicleId || !minPrice(first) || !minPrice(second))}
              </>}
              {panel === 'expense' && <>
                <Field label="Nome da despesa" value={first} onChangeText={setFirst} />
                <NumberField mode="money" label="Valor (R$)" value={second} onChange={setSecond} />
                {submit('Salvar despesa', () => save('entries', { kind: 'expense', label: first, amount: cents(second) }), !first.trim() || !minPrice(second))}
              </>}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  </View>
}

export default function App() {
  return <SafeAreaProvider><StatusBar style="dark" /><Operation /></SafeAreaProvider>
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#dbe9e2' },
  keyboard: { flex: 1 },
  login: { flex: 1, paddingBottom: 36 },
  loginBody: { padding: 18, flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  loginCard: { width: '100%', maxWidth: 440, gap: 12, padding: 20, borderRadius: 22, backgroundColor: '#fff', elevation: 5 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandIcon: { width: 34, height: 34, borderRadius: 9 },
  brand: { fontSize: 23, fontWeight: '900', color: '#0b5a48', letterSpacing: -.7 },
  title: { fontSize: 21, fontWeight: '800', color: '#142d24' },
  label: { color: '#142d24', fontWeight: '800' },
  overlay: { ...StyleSheet.absoluteFill, justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 8 },
  card: { borderRadius: 19, padding: 12, gap: 7, backgroundColor: '#fff', elevation: 4 },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 18, backgroundColor: '#fff', padding: 8 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 4, flexWrap: 'wrap' },
  stats: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, gap: 4, borderRadius: 15, backgroundColor: '#13392e' },
  headerActions: { flexDirection: 'row', gap: 5 },
  periodRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  segment: { flexDirection: 'row', gap: 3, padding: 3, borderRadius: 10, backgroundColor: '#edf4f0' },
  segmentButton: { minHeight: 34, paddingHorizontal: 13, borderRadius: 8, justifyContent: 'center' },
  segmentSelected: { backgroundColor: '#fff', elevation: 1 },
  segmentLabel: { color: '#0b5a48', fontWeight: '700' },
  idleStats: { flexDirection: 'row', gap: 5, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#dbe9e2' },
  drawer: { gap: 5 },
  grip: { alignSelf: 'center', width: 32, height: 4, borderRadius: 4, backgroundColor: '#a0b8ad' },
  destinationRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 3 },
  destination: { flex: 1, gap: 3 },
  estimate: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 6, borderRadius: 9, backgroundColor: '#edf4f0' },
  estimateText: { color: '#15362f', fontWeight: '800', fontSize: 13, fontVariant: ['tabular-nums'] },
  passenger: { flexDirection: 'row', gap: 8, minHeight: 56 },
  fareBadge: { color: '#fff', fontWeight: '800', borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden', backgroundColor: '#317464' },
  routePreview: { gap: 5, borderRadius: 13, backgroundColor: '#edf4f0', padding: 12 },
  error: { color: '#8a2019', backgroundColor: '#fff0ef', padding: 9, borderRadius: 9 },
  modalBase: { flex: 1, backgroundColor: '#142f2963' },
  sheetKeyboard: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '94%', flexShrink: 1, backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, gap: 12 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, gap: 8 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  sheetBody: { paddingHorizontal: 16, paddingBottom: 20, gap: 12 },
})
