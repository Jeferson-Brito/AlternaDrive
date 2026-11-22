import * as SplashScreen from 'expo-splash-screen'
import { Nunito_400Regular, Nunito_700Bold, Nunito_800ExtraBold, useFonts } from '@expo-google-fonts/nunito'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Alert, AppState, Image, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native'
import { Text } from './src/type'
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Location from 'expo-location'
import * as SecureStore from 'expo-secure-store'
import { StatusBar } from 'expo-status-bar'
import { api, ApiError, authenticate, clearSession, readSession } from './src/api'
import { Button, Field, NumberField, ui } from './src/controls'
import { JourneyMap, LoginMap } from './src/AppMap'
import { isExpoGo } from './src/environment'
import { VehicleForm } from './src/VehicleForm'
import { StartJourneyForm } from './src/StartJourneyForm'
import { RouteForm } from './src/RouteForm'
import { Icon, IconButton, MenuRow, Metric, Shortcut } from './src/operation-ui'
import { Passenger, usePassengerDemand } from './src/Passenger'
import { DriverMarker } from './src/DriverMarker'
import { carColors, defaultCarColor } from '../src/car-colors'
import { Admin } from './src/Admin'
import { Report } from './src/Report'
import { useNearbyDrivers } from './src/nearby-drivers'
import { useRoadRoute } from './src/road-route'
import { type Boarding, type Closing, type Dashboard, type Place, money, numeric } from './src/model'
import { measuredJourneyKm, onArrival, prepareTracking, recordForegroundLocation, startTracking, stopTracking } from './src/tracking'
import { arrivalRadius, distanceMeters } from '../src/arrival'
import { workDuration } from '../src/journey-time'

if (!isExpoGo) {
  void SplashScreen.preventAutoHideAsync().catch(() => undefined)
  SplashScreen.setOptions({ fade: true, duration: 220 })
}

function Startup() {
  const progress = useRef(new Animated.Value(0)).current
  useEffect(() => {
    let alive = true
    let animation: Animated.CompositeAnimation | undefined
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!alive || reduced) return
      animation = Animated.loop(Animated.timing(progress, { toValue: 1, duration: 1250, useNativeDriver: true }))
      animation.start()
    }).catch(() => undefined)
    return () => { alive = false; animation?.stop() }
  }, [progress])
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-36, 84] })
  return <View style={styles.startup} accessibilityLabel="Abrindo AlternaDrive">
    <StatusBar style="dark" />
    <View style={styles.startupCenter}>
      <Image accessibilityIgnoresInvertColors source={require('./assets/alternadrive.png')} style={styles.startupIcon} />
      <Text style={styles.startupTitle}>AlternaDrive</Text>
      <View style={styles.startupTrack}>
        <Animated.View style={[styles.startupProgress, { transform: [{ translateX }] }]} />
      </View>
    </View>
  </View>
}

type Panel = 'closing' | 'report' | 'menu' | 'profile' | 'password' | 'editVehicle' | 'route' | 'vehicle' | 'start' | 'group' | 'finish' | 'fuel' | 'expense'
const titles: Record<Panel, string> = {
  closing: 'Jornada finalizada', report: 'Lucro por dia', menu: 'Menu da operação', profile: 'Perfil do motorista', password: 'Alterar senha', editVehicle: 'Editar veículo', route: 'Percurso e tarifa', vehicle: 'Cadastrar veículo', start: 'Iniciar jornada',
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
  const dashboardRevision = useRef(0)
  const [pendingBoarding, setPendingBoarding] = useState(0)
  const [adminOpen, setAdminOpen] = useState(false)
  const [passenger, setPassenger] = useState(false)
  const [register, setRegister] = useState(false)
  const [visiblePassword, setVisiblePassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [profileName, setProfileName] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showProfilePasswords, setShowProfilePasswords] = useState(false)
  const [editingVehicleId, setEditingVehicleId] = useState('')
  const [profileColor, setProfileColor] = useState<string>(defaultCarColor)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [hide, setHide] = useState(false)
  const [hideClosing, setHideClosing] = useState(false)
  const actionsOpacity = useRef(new Animated.Value(1)).current
  const reduceMotion = useRef(false)
  const [expanded, setExpanded] = useState(false)
  const journeyDrag = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) =>
      Math.abs(gesture.dy) > 9 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.25,
    onPanResponderRelease: (_, gesture) => {
      if (Math.abs(gesture.dy) >= 28 || (Math.abs(gesture.dy) >= 12 && Math.abs(gesture.vy) >= .35)) {
        setExpanded(gesture.dy < 0)
      }
    },
  }), [])
  const [following, setFollowing] = useState(true)
  const [hiddenJourneyId, setHiddenJourneyId] = useState<string>()
  const [journeyClosing, setJourneyClosing] = useState<Closing>()
  const [position, setPosition] = useState<Location.LocationObject | null>(null)
  const [gpsStatus, setGpsStatus] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [finishEdited, setFinishEdited] = useState(false)
  const [gpsKm, setGpsKm] = useState<number | null>(null)
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const [pointA, setPointA] = useState<Place | null>(null)
  const [pointB, setPointB] = useState<Place | null>(null)
  const [useCurrent, setUseCurrent] = useState(false)

  const reload = useCallback(async (session: string) => {
    try {
      const revision = dashboardRevision.current
      const dashboard = await api<Dashboard>('dashboard', undefined, session)
      if (revision === dashboardRevision.current) setData(dashboard)
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
    void Promise.all([
      readSession(), SecureStore.getItemAsync('alternadrive.hide-finances').catch(() => null),
      SecureStore.getItemAsync('alternadrive.hide-closing-finances').catch(() => null),
    ]).then(async ([saved, privacy, closingPrivacy]) => {
      setHide(privacy === 'true')
      setHideClosing(closingPrivacy === 'true')
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

  const demand = usePassengerDemand(token, position?.coords ?? routeA ?? {latitude: -7.132, longitude: -34.871})

  function toggleFinancePrivacy() {
    const next = !hide
    setHide(next)
    void SecureStore.setItemAsync('alternadrive.hide-finances', String(next)).catch(() => undefined)
  }
  function toggleClosingPrivacy() {
    const next = !hideClosing
    setHideClosing(next)
    void SecureStore.setItemAsync('alternadrive.hide-closing-finances', String(next)).catch(() => undefined)
  }

  useEffect(() => {
    let mounted = true
    const setPreference = (enabled: boolean) => { if (mounted) reduceMotion.current = enabled }
    void AccessibilityInfo.isReduceMotionEnabled().then(setPreference).catch(() => undefined)
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setPreference)
    return () => { mounted = false; listener.remove() }
  }, [])
  useEffect(() => {
    if (!expanded || reduceMotion.current) { actionsOpacity.setValue(1); return }
    actionsOpacity.setValue(0)
    const animation = Animated.timing(actionsOpacity, { toValue: 1, duration: 190, useNativeDriver: true })
    animation.start()
    return () => animation.stop()
  }, [actionsOpacity, expanded])

  const drivers = useNearbyDrivers(token, routeA, position?.coords && (position.coords.accuracy ?? Infinity) <= 50 ? position.coords : null,
    activeId !== hiddenJourneyId ? activeId : undefined, route.road)
  useEffect(() => { setExpanded(false); setFollowing(true) }, [activeId])
  useEffect(() => {
    if (!activeId) { setPosition(null); return }
    let watcher: Location.LocationSubscription | undefined
    let cancelled = false
    void Location.getForegroundPermissionsAsync().then(async permission => {
      if (!permission.granted || cancelled || !active) return
      await prepareTracking(active)
      if (cancelled) return
      watcher = await Location.watchPositionAsync({
        accuracy: Location.Accuracy.High, distanceInterval: 3, timeInterval: 1000,
      }, location => {
        if (cancelled) return
        setPosition(location)
        recordForegroundLocation(location)
      })
      if (cancelled) watcher.remove()
    }).catch(() => { if (!cancelled) setGpsStatus('GPS indisponível.') })
    return () => { cancelled = true; watcher?.remove() }
  }, [activeId, gpsStatus])

  useEffect(() => {
    if (panel !== 'finish' || !activeId || active?.startKm == null) return
    let disposed = false
    const startKm = active.startKm
    const refresh = () => void measuredJourneyKm(activeId).then(km => {
      if (disposed) return
      setGpsKm(km)
      if (!finishEdited && km !== null) {
        const finalKm = Math.max(active.turnKm ?? startKm, Math.round((startKm + km) * 100) / 100)
        setFirst(finalKm.toLocaleString('pt-BR', { maximumFractionDigits: 2 }))
      }
    }).catch(() => undefined)
    refresh()
    const timer = setInterval(refresh, 1200)
    return () => { disposed = true; clearInterval(timer) }
  }, [panel, activeId, active?.startKm, active?.turnKm, finishEdited])

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
    if (next === 'profile') {
      setProfileName(data?.user.name ?? '')
      setProfileColor(data?.user.carColor ?? defaultCarColor)
    }
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setShowProfilePasswords(false)
    setError('')
    setFirst(next === 'route' && data?.defaults.defaultFare ? (data.defaults.defaultFare / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')
    setSecond('')
    setFinishEdited(false)
    setGpsKm(null)
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
    let approachFrom
    let fix: Location.LocationObject | null = null
    const a = data?.defaults.defaultPointA
    const b = data?.defaults.defaultPointB
    const permission = await Location.requestForegroundPermissionsAsync()
    if (permission.granted) {
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        fix = await Location.getLastKnownPositionAsync({ maxAge: 10000, requiredAccuracy: 40 })
        if (!fix) {
          fix = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
            new Promise<null>(resolve => { timeout = setTimeout(() => resolve(null), 5500) }),
          ])
        }
      } catch { fix = null }
      finally { clearTimeout(timeout) }
    }
    if (useCurrent) {
      if (!fix || (fix.coords.accuracy ?? Infinity) > 50) throw new Error('Aguarde um sinal de GPS mais preciso para usar a localização atual.')
      currentLocation = { latitude: fix.coords.latitude, longitude: fix.coords.longitude, address: 'Localização atual' }
    } else if (fix && a && b && (fix.coords.accuracy ?? Infinity) <= 50 &&
        distanceMeters(fix.coords, a) > arrivalRadius(a, b)) {
      const choice = await new Promise<'approach' | 'direct' | 'cancel'>(resolve => {
        Alert.alert('Ir até o ponto inicial?', 'Você está fora do Ponto A. O deslocamento até lá conta na jornada. Ao chegar, o mapa muda para o Ponto B.', [
          { text: 'Cancelar', style: 'cancel', onPress: () => resolve('cancel') },
          { text: 'Iniciar direto', onPress: () => resolve('direct') },
          { text: 'Ir ao Ponto A', onPress: () => resolve('approach') },
        ], { cancelable: true, onDismiss: () => resolve('cancel') })
      })
      if (choice === 'cancel') return
      if (choice === 'approach') approachFrom = { latitude: fix.coords.latitude, longitude: fix.coords.longitude }
    }
    const created = await api<NonNullable<Dashboard['active']>>('journeys', {
      vehicleId, startKm: numeric(first), currentLocation, approachFrom,
    }, token)
    if (permission.granted) {
      const latest = await Location.getLastKnownPositionAsync({ maxAge: 10000, requiredAccuracy: 35 }).catch(() => null)
      await prepareTracking(created, latest ?? fix)
    }
    if (fix) setPosition(fix)
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
    setJourneyClosing(closing)
    show('closing')
    await reload(token)
  }

  const secureError = !!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
  if (adminOpen && token && data?.user.isAdmin) return <Admin token={token} center={routeA ?? undefined} close={() => setAdminOpen(false)} />

  if (passenger) return <Passenger close={() => setPassenger(false)} />

  if (!ready || (token && !data && !error)) return <Startup />

  if (!token || !data) return <View style={styles.root}>
    <LoginMap bottomInset={bottom} />
    <SafeAreaView pointerEvents="box-none" style={styles.login}>
      <KeyboardAvoidingView behavior="padding" style={styles.keyboard}>
        <ScrollView contentContainerStyle={styles.loginBody} keyboardShouldPersistTaps="handled">
          <View style={styles.loginCard}>
            <Brand />
            <Text style={styles.title}>{token ? 'Não foi possível conectar' : register ? 'Criar conta' : 'Entre na sua conta'}</Text>
            {secureError}
            {token ? <Button title="Tentar novamente" disabled={busy} onPress={() => void run(async () => { await reload(token) })} /> : <>
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
              <Pressable accessibilityRole="button" style={styles.loginLink} onPress={() => { setRegister(!register); setError('') }}>
                <Text style={styles.linkText}>{register ? 'Já tenho conta' : 'Criar conta'}</Text>
              </Pressable>
            </>}
            {!token && <View style={styles.loginPassenger}>
              <MenuRow icon="route" label="Abrir mapa do passageiro" onPress={() => setPassenger(true)} />
            </View>}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </View>

  const stats = data.summaries.find(item => item.period === 'day')
  const destination = active ? (active.approachingStart || active.arrivals % 2 ? active.origin : active.destination) : data.defaults.defaultDestination
  const dayRevenue = money((stats?.revenue ?? 0) + pendingBoarding * (active?.fare ?? 0))
  const dayBoardings = (stats?.passengers ?? 0) + pendingBoarding
  const vehicles = data.vehicles.map(vehicle => <Button key={vehicle.id} secondary={vehicle.id !== vehicleId}
    title={vehicle.name} onPress={() => setVehicleId(vehicle.id)} />)
  const submit = (title: string, action: () => Promise<void>, invalid = false) =>
    <Button title={busy ? 'Aguarde…' : title} disabled={busy || invalid} onPress={() => void run(action)} />
  const cents = (input: string) => Math.round(numeric(input) * 100)
  const minPrice = (input: string) => numeric(input) > 0
  const odometerValue = numeric(first)
  const validOdometer = odometerValue >= 0 && odometerValue <= 10_000_000

  return <View style={styles.root}>
    <JourneyMap a={routeA} b={routeB} active={active ?? null} route={route}
      following={following} onExplore={() => setFollowing(false)} drivers={drivers} demand={demand} carColor={data.user.carColor} />
    <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
      {active ? <View style={styles.stats}>
        <Metric label="Embarques" value={dayBoardings} dark />
        <Metric label="Receita" value={hide ? '••••' : dayRevenue} dark />
        <Metric label="Lucro est." value={hide ? '••••' : money(stats?.profit ?? null)} dark />
        <IconButton dark icon={hide ? 'eyeOff' : 'eye'} label={hide ? 'Exibir valores' : 'Ocultar valores'} onPress={toggleFinancePrivacy} />
      </View> : <View style={styles.homeTop} pointerEvents="box-none">
        <View style={styles.floatingMenu}>
          <IconButton icon="menu" label="Menu da operação" onPress={() => show('menu')} />
        </View>
        <View style={styles.dayBubble}>
          <View style={styles.dayMetric}>
            <Text style={styles.dayLabel}>Receita hoje</Text>
            <Text style={styles.dayValue} numberOfLines={1} adjustsFontSizeToFit>{dayRevenue}</Text>
          </View>
          <View style={styles.dayDivider} />
          <View style={styles.dayBoardings}>
            <Text style={styles.dayLabel}>Embarques hoje</Text>
            <Text style={styles.dayValue}>{dayBoardings}</Text>
          </View>
        </View>
      </View>}
      {active && !following ? <View style={styles.recenter}>
        <Button title="Recentralizar veículo" onPress={() => setFollowing(true)} />
      </View> : <View style={active ? styles.card : styles.homeAction} {...(active ? journeyDrag.panHandlers : {})}>
        {!!error && !panel && secureError}
        {active ? <>
          <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Recolher ações' : 'Expandir ações'}
            accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={styles.drawer}>
            <View style={styles.grip} />
            <View style={styles.destinationRow}>
              <View style={styles.destination}>
                <Text style={styles.label}>{'Próximo destino · Ponto ' + (active.approachingStart || active.arrivals % 2 ? 'A' : 'B')}</Text>
                <Text numberOfLines={1} style={ui.muted}>{destination}</Text>
              </View>
              <Icon name={expanded ? 'down' : 'up'} />
            </View>
          </Pressable>
          {active.approachingStart && <Text style={ui.muted}>A caminho do ponto inicial</Text>}
          {route.estimate && <View style={styles.estimate}>
            <Text style={styles.estimateText}>{Math.ceil(route.estimate.seconds / 60)} min</Text>
            <Text style={styles.estimateText}>às {new Date(Date.now() + route.estimate.seconds * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>
            <Text style={styles.estimateText}>{(route.estimate.meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km</Text>
          </View>}
          <Pressable accessibilityRole="button" disabled={busy} accessibilityLabel={'Registrar passageiro por ' + money(active.fare)}
            style={({ pressed }) => [ui.button, styles.passenger, (pressed || busy) && ui.dim]}
            onPress={() => void run(async () => {
              setPendingBoarding(1)
              try {
                const boarding = await api<Boarding>('journeys/' + active.id + '/boardings', { count: 1 }, token)
                dashboardRevision.current++
                setData(current => {
                  if (!current || current.active?.id !== active.id || current.active.boardings.some(item => item.id === boarding.id)) return current
                  const cutoff = Date.parse(current.nextReportingDay)
                  const time = Date.parse(boarding.createdAt)
                  const belongsToToday = time < cutoff && time >= cutoff - 86_400_000
                  const revenue = boarding.count * boarding.fare
                  return {
                    ...current,
                    active: { ...current.active, boardings: [boarding, ...current.active.boardings] },
                    summaries: belongsToToday ? current.summaries.map(summary => summary.period === 'day' ? {
                      ...summary, passengers: summary.passengers + boarding.count, revenue: summary.revenue + revenue,
                      profit: summary.profit === null ? null : summary.profit + revenue,
                    } : summary) : current.summaries,
                  }
                })
                void reload(token).catch(() => undefined)
              } finally {
                setPendingBoarding(0)
              }
            })}>
            <Icon name="plus" color="#fff" size={24} />
            <Text style={ui.buttonText}>Passageiro</Text>
            <Text style={styles.fareBadge}>{money(active.fare)}</Text>
          </Pressable>
          {expanded && <Animated.View style={[styles.expandedActions, { opacity: actionsOpacity }]}>
            {!!gpsStatus && <Text style={ui.muted}>{gpsStatus}</Text>}
            <View style={styles.sharing}>
              <View style={styles.sharingCopy}>
                <Text style={styles.label}>Aparecer no mapa do AlternaDrive</Text>
                <Text style={ui.muted}>Compartilha a posição aproximada enquanto o app está aberto nesta jornada.</Text>
              </View>
              <Switch accessibilityLabel="Aparecer no mapa do AlternaDrive" value={hiddenJourneyId !== active.id}
                onValueChange={enabled => setHiddenJourneyId(enabled ? undefined : active.id)} />
            </View>
            <Text style={ui.muted}>Tempo trabalhado · {workDuration(active.startedAt, Date.now())}</Text>
            <View style={styles.actionRow}>
              {active.vehicle.type !== 'motorcycle' && <Shortcut icon="users" text="Grupo" onPress={() => show('group')} />}
              <Shortcut icon="fuel" text="Abastecer" onPress={() => show('fuel')} />
              <Shortcut icon="receipt" text="Despesa" onPress={() => show('expense')} />
              <Shortcut icon="flag" text="Finalizar" danger onPress={() => show('finish')} />
            </View>
            {!isExpoGo && gpsStatus !== 'GPS em segundo plano ativo' && <Button secondary title="Ativar GPS em segundo plano"
              disabled={busy} onPress={() => void run(() => enableTracking(active))} />}
          </Animated.View>}
        </> : <>
          <Pressable accessibilityRole="button" style={({ pressed }) => [ui.button, styles.homeStart, pressed && ui.dim]}
            onPress={() => show(!data.vehicles.length ? 'vehicle' : !data.defaults.defaultPointA ? 'route' : 'start')}>
            <Icon name="route" color="#fff" size={22} />
            <Text style={ui.buttonText}>{data.vehicles.length ? 'Iniciar jornada' : 'Cadastrar primeiro veículo'}</Text>
          </Pressable>
          {!!data.defaults.defaultPointA && <Pressable accessibilityRole="button" accessibilityLabel="Editar percurso"
            style={({ pressed }) => [styles.homeRoute, pressed && ui.dim]} onPress={() => show('route')}>
            <Icon name="route" size={17} />
            <Text numberOfLines={1} style={styles.homeRouteLabel}>{data.defaults.defaultDestination}</Text>
            <Text style={styles.linkText}>Editar</Text>
          </Pressable>}
        </>}
      </View>}
    </SafeAreaView>

    <Modal visible={panel !== null} transparent animationType="slide" onRequestClose={() => { if (!busy) show(null) }}>
      <SafeAreaView style={styles.modalBase} edges={['top', 'bottom']}>
        <KeyboardAvoidingView behavior="padding" style={styles.sheetKeyboard}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}><Text style={styles.title}>{panel && titles[panel]}</Text><IconButton icon="close" label="Fechar" disabled={busy} onPress={() => show(null)} /></View>
            <ScrollView key={panel} style={styles.scroll} contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              {secureError}
              {panel === 'closing' && journeyClosing && <>
                <View style={styles.closingHero}>
                  <View style={styles.closingHeading}>
                    <Text style={styles.closingLabel}>Lucro líquido estimado</Text>
                    <IconButton dark icon={hideClosing ? 'eyeOff' : 'eye'} label={hideClosing ? 'Exibir valores do resumo' : 'Ocultar valores do resumo'}
                      onPress={toggleClosingPrivacy} />
                  </View>
                  <Text style={styles.closingValue}>{hideClosing ? '••••' : money(journeyClosing.profit)}</Text>
                </View>
                <View style={styles.closingMetrics}>
                  <Metric label="Tempo trabalhado" value={workDuration(journeyClosing.startedAt, journeyClosing.endedAt)} />
                  <Metric label="Distância" value={journeyClosing.distance.toLocaleString('pt-BR') + ' km'} />
                  <Metric label="Embarques" value={journeyClosing.passengers} />
                </View>
                <View style={styles.closingDetails}>
                  {[['Receita bruta', journeyClosing.revenue], ['Combustível estimado', journeyClosing.fuel], ['Outras despesas', journeyClosing.otherExpenses]].map(([label, value]) =>
                    <View key={String(label)} style={styles.closingRow}>
                      <Text style={ui.label}>{label}</Text>
                      <Text style={styles.label}>{hideClosing ? '••••' : money(value as number | null)}</Text>
                    </View>)}
                </View>
                <Button title="Voltar ao mapa" onPress={() => show(null)} />
              </>}
              {panel === 'report' && <Report token={token} />}
              {panel === 'profile' && <>
                <View style={styles.profileCard}>
                  <View style={styles.profileIcon}><DriverMarker carColor={profileColor} /></View>
                  <View style={styles.profileDetails}>
                    <Text style={styles.title}>{data.user.name}</Text>
                    <Text style={ui.muted}>{data.user.email}</Text>
                  </View>
                </View>
                <Field label="Nome" value={profileName} onChangeText={setProfileName} maxLength={100} />
                <Text style={styles.label}>Cor do carro no mapa</Text>
                <View style={styles.colorGrid}>
                  {carColors.map(color => <Pressable key={color.value} accessibilityRole="radio"
                    accessibilityState={{ selected: profileColor === color.value, disabled: busy }} disabled={busy}
                    onPress={() => setProfileColor(color.value)}
                    style={[styles.colorOption, profileColor === color.value && styles.selectedColor]}>
                    <View style={[styles.colorSwatch, { backgroundColor: color.value }]} />
                    <Text style={styles.label}>{color.name}</Text>
                  </Pressable>)}
                </View>
                {submit('Salvar perfil', async () => {
                  const profile = await api<Dashboard['user']>('settings/profile', { name: profileName.trim(), carColor: profileColor }, token)
                  dashboardRevision.current++
                  setData(current => current ? { ...current, user: profile } : current)
                  show('menu')
                }, !profileName.trim() || (profileName.trim() === data.user.name && profileColor === (data.user.carColor ?? defaultCarColor)))}
                <Button secondary title="Alterar senha" onPress={() => show('password')} />
                <Text style={styles.label}>Meus veículos</Text>
                {data.vehicles.map(vehicle => <Button key={vehicle.id} secondary title={vehicle.name}
                  accessibilityLabel={'Editar ' + vehicle.name} onPress={() => { setEditingVehicleId(vehicle.id); show('editVehicle') }} />)}
                <Button secondary title="Cadastrar veículo" onPress={() => show('vehicle')} />
              </>}
              {panel === 'password' && <>
                <Field label="Senha atual" value={currentPassword} onChangeText={setCurrentPassword} maxLength={128} autoCapitalize="none" secureTextEntry={!showProfilePasswords} />
                <Field label="Nova senha" value={newPassword} onChangeText={setNewPassword} maxLength={128} autoCapitalize="none" secureTextEntry={!showProfilePasswords} />
                <Field label="Confirme a nova senha" value={confirmPassword} onChangeText={setConfirmPassword} maxLength={128} autoCapitalize="none" secureTextEntry={!showProfilePasswords} />
                <Button secondary title={showProfilePasswords ? 'Ocultar senhas' : 'Mostrar senhas'} onPress={() => setShowProfilePasswords(value => !value)} />
                <Text style={ui.muted}>Use pelo menos 8 caracteres. Outros aparelhos precisarão entrar novamente.</Text>
                {!!confirmPassword && newPassword !== confirmPassword && <Text style={ui.muted}>As senhas precisam ser iguais.</Text>}
                {submit('Salvar nova senha', async () => {
                  await api('settings/password', { currentPassword, newPassword }, token)
                  show('profile')
                }, currentPassword.length < 8 || newPassword.length < 8 || newPassword === currentPassword || newPassword !== confirmPassword)}
                <Button secondary title="Voltar ao perfil" disabled={busy} onPress={() => show('profile')} />
              </>}
              {panel === 'editVehicle' && <>
                <VehicleForm busy={busy} vehicle={data.vehicles.find(vehicle => vehicle.id === editingVehicleId)}
                  save={vehicle => void run(async () => {
                    await api('vehicles/' + editingVehicleId + '/edit', vehicle, token)
                    await reload(token)
                    show('profile')
                  })} />
                <Button secondary title="Voltar ao perfil" disabled={busy} onPress={() => show('profile')} />
              </>}
              {panel === 'menu' && <>
                <View style={styles.profileCard}>
                  <View style={styles.profileIcon}><DriverMarker carColor={data.user.carColor} /></View>
                  <View style={styles.profileDetails}>
                    <Text style={styles.title} numberOfLines={2}>{data.user.name}</Text>
                    <Button secondary title="Ver perfil" onPress={() => show('profile')} />
                  </View>
                </View>

                <View style={styles.menuGroup}>
                  <MenuRow icon="chart" label="Lucro por dia" onPress={() => show('report')} />
                  <MenuRow icon="route" label="Percurso e tarifa" onPress={() => show('route')} />
                  <MenuRow icon="car" label="Cadastrar veículo" onPress={() => show('vehicle')} />
                </View>
                <View style={styles.menuGroup}>
                  {!!data.vehicles.length && <MenuRow icon="fuel" label="Abastecimento" onPress={() => show('fuel')} />}
                  <MenuRow icon="receipt" label="Registrar despesa" onPress={() => show('expense')} />
                  {data.user.isAdmin && <MenuRow icon="profile" label="Administração" onPress={() => { show(null); setAdminOpen(true) }} />}
                </View>
                {submit('Sair', async () => {
                  await api('logout', {}, token)
                  await stopTracking().catch(() => undefined)
                  await clearSession()
                  show(null)
                  setToken(null)
                  setData(null)
                })}
              </>}
              {panel === 'route' && <RouteForm token={token} origin={pointA} destination={pointB}
                onOrigin={setPointA} onDestination={setPointB} fare={first} onFare={setFirst} busy={busy}
                onSave={() => void run(async () => {
                  const defaults = await api<Dashboard['defaults']>('settings/journey', {
                    defaultOrigin: pointA?.label, defaultDestination: pointB?.label,
                    defaultPointA: pointA, defaultPointB: pointB, defaultFare: cents(first),
                  }, token)
                  dashboardRevision.current++
                  setData(current => current ? { ...current, defaults } : current)
                  show(null)
                })} />}
              {panel === 'vehicle' && <VehicleForm busy={busy} save={vehicle => void run(() => save('vehicles', vehicle))} />}
              {panel === 'fuel' && <><Text style={styles.label}>Veículo</Text>{vehicles}</>}
              {panel === 'start' && <StartJourneyForm defaults={data.defaults} vehicles={data.vehicles}
                vehicleId={vehicleId} onVehicle={setVehicleId} odometer={first} onOdometer={setFirst}
                useCurrent={useCurrent} onUseCurrent={setUseCurrent} busy={busy} />}
              {panel === 'group' && <>
                <NumberField label="Número de passageiros" value={first} onChange={setFirst} />
                {submit('Registrar grupo', () => save('journeys/' + active?.id + '/boardings', { count: numeric(first) }), !Number.isInteger(numeric(first)) || !minPrice(first))}
              </>}
              {panel === 'finish' && <>
                <View style={styles.routePreview}>
                  <Text style={ui.muted}>Distância registrada pelo GPS</Text>
                  <Text style={styles.label}>{gpsKm === null ? 'GPS sem distância suficiente para estimar'
                    : gpsKm.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' km'}</Text>
                </View>
                <NumberField mode="odometer" label="Hodômetro final (km)" value={first}
                  onChange={value => { setFinishEdited(true); setFirst(value) }} />
                <Text style={ui.muted}>{gpsKm === null ? 'Informe a leitura do painel para encerrar.'
                  : 'Confira a leitura sugerida e corrija se necessário.'}</Text>
                {validOdometer && odometerValue >= (active?.startKm ?? 0) && <Text style={styles.label}>
                  Distância para o relatório · {(odometerValue - (active?.startKm ?? 0)).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km
                </Text>}
                {submit('Confirmar encerramento', finish, !validOdometer || odometerValue < (active?.turnKm ?? active?.startKm ?? 0))}
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
            {panel === 'start' && <View style={styles.startFooter}>
              {submit('Iniciar jornada', begin, !vehicleId || !validOdometer)}
            </View>}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  </View>
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({ Nunito_400Regular, Nunito_700Bold, Nunito_800ExtraBold })
  const ready = fontsLoaded || !!fontError
  useEffect(() => {
    if (ready && !isExpoGo) void SplashScreen.hideAsync().catch(() => undefined)
  }, [ready])
  return <SafeAreaProvider>
    <View style={styles.appSurface}>
      <StatusBar style="dark" />
      {ready ? <Operation /> : <Startup />}
    </View>
  </SafeAreaProvider>
}

const styles = StyleSheet.create({
  appSurface: { flex: 1, backgroundColor: '#f4f9f6' },
  startup: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f9f6' },
  startupCenter: { alignItems: 'center', height: 92, width: '100%' },
  startupIcon: { width: 92, height: 92, borderRadius: 24 },
  startupTitle: { position: 'absolute', top: 107, color: '#163c32', fontSize: 30, fontWeight: '800', letterSpacing: -.7 },
  startupTrack: { position: 'absolute', top: 161, width: 84, height: 3, borderRadius: 3, overflow: 'hidden', backgroundColor: '#d5e8df' },
  startupProgress: { width: 36, height: 3, borderRadius: 3, backgroundColor: '#2e846e' },
  startFooter: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#dceae3' },
  loginLink: { alignItems: 'center', justifyContent: 'center', minHeight: 42 },
  linkText: { color: '#0b5a48', fontWeight: '800', fontSize: 13 },
  loginPassenger: { borderTopWidth: 1, borderTopColor: '#e2ece7', paddingTop: 6 },
  menuGroup: { borderWidth: 1, borderColor: '#e1ece6', borderRadius: 17, overflow: 'hidden', backgroundColor: '#fbfdfc' },
  homeRoute: { flexDirection: 'row', alignItems: 'center', minHeight: 43, gap: 9, paddingHorizontal: 10 },
  homeRouteLabel: { flex: 1, color: '#3c5b51', fontSize: 13, fontWeight: '700' },
  expandedActions: { gap: 8 },
  closingHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: '#eff6f2' },
  profileIcon: { width: 58, height: 62, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#deeee6' },
  profileDetails: { flex: 1, gap: 6 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colorOption: { flexBasis: '46%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, paddingHorizontal: 10, borderWidth: 2, borderColor: '#e0ebe5', borderRadius: 10 },
  selectedColor: { borderColor: '#0b5a48', backgroundColor: '#eff6f2' },
  colorSwatch: { width: 21, height: 21, borderRadius: 11 },
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
  card: { borderRadius: 24, padding: 11, gap: 7, backgroundColor: '#fff', elevation: 3 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 4, flexWrap: 'wrap' },
  stats: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, gap: 4, borderRadius: 21, backgroundColor: '#153c32' },
  recenter: { alignSelf: 'center', width: '83%', maxWidth: 340, paddingBottom: 9 },
  sharing: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, backgroundColor: '#edf4f0' },
  sharingCopy: { flex: 1, gap: 2 },
  closingHero: { padding: 16, borderRadius: 15, backgroundColor: '#15362c', gap: 5 },
  closingLabel: { color: '#cbe4da', fontWeight: '600' },
  closingValue: { color: '#fff', fontSize: 26, fontWeight: '800' },
  closingMetrics: { flexDirection: 'row', paddingVertical: 12, backgroundColor: '#edf4f0', borderRadius: 12, gap: 5 },
  closingDetails: { backgroundColor: '#f6faf8', borderRadius: 12, padding: 10, gap: 5 },
  closingRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 5, gap: 10 },
  homeTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  floatingMenu: { backgroundColor: '#edf4f0', borderRadius: 13, elevation: 4 },
  dayBubble: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 22,
    paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#e4ede8', elevation: 4 },
  dayMetric: { flexShrink: 1, minWidth: 58, gap: 2 },
  dayBoardings: { gap: 2 },
  dayDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: '#dbe9e2' },
  dayLabel: { color: '#526a60', fontSize: 11, fontWeight: '600' },
  dayValue: { color: '#15362f', fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  homeAction: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e4ede8', borderRadius: 23, padding: 7, gap: 6, elevation: 3 },
  homeStart: { minHeight: 52, flexDirection: 'row', gap: 8 },
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
  sheet: { maxHeight: '94%', flexShrink: 1, backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 12 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, gap: 8 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  sheetBody: { paddingHorizontal: 16, paddingBottom: 20, gap: 12 },
})
