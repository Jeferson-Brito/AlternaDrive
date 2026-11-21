import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Line, Path, Text as AxisText } from 'react-native-svg'
import { api } from './api'
import { Button, Field, ui } from './controls'
import { money } from './model'
import { Metric } from './operation-ui'

const periods = [['week', 'Semana'], ['month', 'Mês'], ['bimester', 'Bimestre'], ['quarter', 'Trimestre'],
  ['semester', 'Semestre'], ['year', 'Ano'], ['custom', 'Personalizado']]
type Payment = { label: string; time: string; amount: number }
type Day = {
  date: string; profit: number | null; passengers: number; revenue: number; fuel: number; expenses: number;
  refills: number; distance: number; unpricedDistance: number; journeys: number; emptyLegs: number;
  emptyLoss: number; expenseItems: Payment[]; refillItems: Payment[]
}
type Series = { start: string; end: string; points: Day[] }
const dateLabel = (iso: string) => iso.split('-').reverse().join('/')
const shortDate = (iso: string) => dateLabel(iso).slice(0, 5)
const km = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' km'

function Row({ label, value }: { label: string; value: string }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.amount}>{value}</Text></View>
}

function Payments({ title, data, total }: { title: string; data: Payment[]; total: number }) {
  return <View style={styles.payments}>
    <Row label={title} value={money(total)} />
    {data.length ? data.map((item, index) =>
      <Row key={index} label={item.label + ' · ' + item.time} value={money(item.amount)} />)
      : <Text style={ui.muted}>Nenhum lançamento registrado.</Text>}
  </View>
}

function Chart({ series }: { series: Series }) {
  const points = series.points
  const [index, select] = useState(points.length - 1)
  const [width, setWidth] = useState(1)
  const day = points[index]
  const values = points.flatMap(point => point.profit === null ? [] : [point.profit])
  const total = values.reduce((sum, value) => sum + value, 0)
  const min = Math.min(0, ...values), max = Math.max(0, ...values)
  const padding = Math.max(50, (max - min) * .085)
  const x = (i: number) => points.length === 1 ? 190 : 53 + 315 * i / (points.length - 1)
  const y = (value: number) => 15 + 130 * (max + padding - value) / (max - min + 2 * padding)
  const path = points.map(({ profit }, i) => profit === null ? '' :
    (i === 0 || points[i - 1].profit === null ? 'M' : 'L') + x(i) + ',' + y(profit)).join(' ')
  const ticks = [...new Set([0, Math.round((points.length - 1) / 3), Math.round((points.length - 1) * 2 / 3), points.length - 1])]

  return <>
    <View style={styles.overview}>
      <Text style={styles.overviewLabel}>{values.length < points.length ? 'Lucro apurado até agora' : 'Lucro estimado no período'}</Text>
      <Text style={styles.overviewValue}>{values.length ? money(total) : 'Pendente'}</Text>
      <Text style={styles.overviewLabel}>{dateLabel(series.start)} a {dateLabel(series.end)}</Text>
    </View>
    <View style={styles.chart}>
      <Text style={ui.label}>Lucro diário</Text>
      <Text style={ui.muted}>Toque no gráfico para escolher um dia.</Text>
      <Pressable accessibilityRole="adjustable" accessibilityLabel="Gráfico de lucro diário"
        accessibilityValue={{ min: 1, max: points.length, now: index + 1 }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={event => select(current => Math.max(0, Math.min(points.length - 1, current + (event.nativeEvent.actionName === 'increment' ? 1 : -1))))}
        onLayout={event => setWidth(event.nativeEvent.layout.width)}
        onPress={event => {
          const cursor = event.nativeEvent.locationX * 380 / width
          select(Math.max(0, Math.min(points.length - 1, Math.round((cursor - 53) * (points.length - 1) / 315))))
        }}>
        <Svg width="100%" height={155} viewBox="0 0 380 165" preserveAspectRatio="none" pointerEvents="none">
          {[...new Set([max, 0, min])].filter(value => value === 0 || Math.abs(y(value) - y(0)) > 18).map(value =>
            <Line key={value} x1={53} x2={368} y1={y(value)} y2={y(value)} stroke="#d8e5df" />)}
          <AxisText x={48} y={y(0) + 3} textAnchor="end" fill="#526a60" fontSize={10}>R$ 0</AxisText>
          <Line x1={x(index)} x2={x(index)} y1={9} y2={145} stroke="#b4ccc2" />
          {!!path && <Path d={path} stroke="#0b705a" strokeWidth={2.4} fill="none" />}
          {points.map(({ date, profit }, i) => profit === null ? null :
            <Circle key={date} cx={x(i)} cy={y(profit)} r={i === index ? 5.3 : points.length <= 31 ? 3 : 1.8}
              fill="#0b705a" stroke={i === index ? '#fff' : 'none'} strokeWidth={1.5} />)}
          {ticks.map(i => <AxisText key={i} x={x(i)} y={160} textAnchor="middle" fill="#526a60" fontSize={10}>
            {shortDate(points[i].date)}
          </AxisText>)}
        </Svg>
      </Pressable>
      <View style={styles.dayNav}>
        <Button secondary title="‹" accessibilityLabel="Dia anterior" disabled={index === 0} onPress={() => select(index - 1)} />
        <View style={styles.selection}><Text style={ui.muted}>{dateLabel(day.date)}</Text><Text style={styles.amount}>{money(day.profit)}</Text></View>
        <Button secondary title="›" accessibilityLabel="Próximo dia" disabled={index === points.length - 1} onPress={() => select(index + 1)} />
      </View>
    </View>
    <Row label="Relatório do dia" value={dateLabel(day.date)} />
    <View style={styles.metrics}>
      <Metric label="Embarques" value={day.passengers} /><Metric label="Jornadas" value={day.journeys} /><Metric label="Distância" value={km(day.distance)} />
    </View>
    <Row label="Faturamento bruto" value={money(day.revenue)} />
    <Row label="Combustível consumido (estimado)" value={day.unpricedDistance > 0 ? 'Pendente' : money(day.fuel)} />
    <Row label="Outras despesas" value={money(day.expenses)} />
    <Row label="Lucro líquido estimado" value={money(day.profit)} />
    {day.emptyLegs > 0 && <Text style={ui.muted}>{day.emptyLegs} trecho(s) vazio(s) · {money(day.emptyLoss)} em combustível estimado</Text>}
    <Payments title="Despesas registradas" data={day.expenseItems} total={day.expenses} />
    <Payments title="Abastecimentos pagos" data={day.refillItems} total={day.refills} />
  </>
}

export function Report({ token }: { token: string }) {
  const [period, setPeriod] = useState('month')
  const [series, setSeries] = useState<Series>()
  const [error, setError] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [range, setRange] = useState('')
  useEffect(() => {
    let current = true
    setSeries(undefined)
    setError('')
    if (period === 'custom' && !range) return
    void api<Series>('reports/daily-profit?period=' + period + (period === 'custom' ? range : ''), undefined, token).then(
      result => { if (current) setSeries(result) },
      failure => { if (current) setError(failure.message) },
    )
    return () => { current = false }
  }, [period, token, range])

  return <View style={styles.report}>
    <Text style={ui.label}>Período</Text>
    <View style={styles.periods}>{periods.map(([id, title]) =>
      <Button key={id} title={title} secondary={id !== period} onPress={() => setPeriod(id)} />)}</View>
    {period === 'custom' && <>
      <Field label="Início" placeholder="AAAA-MM-DD" value={start} onChangeText={setStart} maxLength={10} />
      <Field label="Fim" placeholder="AAAA-MM-DD" value={end} onChangeText={setEnd} maxLength={10} />
      <Button title="Aplicar período" disabled={![start, end].every(value => /^\d{4}-\d{2}-\d{2}$/.test(value))}
        onPress={() => setRange('&start=' + start + '&end=' + end)} />
    </>}
    {error ? <Text accessibilityRole="alert" style={ui.muted}>{error}</Text>
      : series?.points.length ? <Chart key={period + series.start + series.end} series={series} />
      : (period !== 'custom' || !!range) && <Text style={ui.muted}>Carregando relatório…</Text>}
  </View>
}

const styles = StyleSheet.create({
  report: { gap: 10 },
  periods: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  overview: { backgroundColor: '#15362c', borderRadius: 14, padding: 14, gap: 4 },
  overviewLabel: { color: '#d6eee4', fontSize: 13 },
  overviewValue: { color: '#fff', fontSize: 25, fontWeight: '800' },
  chart: { gap: 6, backgroundColor: '#f5faf7', borderWidth: 1, borderColor: '#dae9e0', borderRadius: 14, padding: 10 },
  dayNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#d8e5df', paddingTop: 8 },
  selection: { alignItems: 'center', gap: 3 },
  metrics: { flexDirection: 'row', gap: 4, paddingVertical: 9, borderRadius: 12, backgroundColor: '#edf4f0' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 4 },
  rowLabel: { flex: 1, color: '#142d24', fontWeight: '600' },
  amount: { color: '#13392e', fontWeight: '800' },
  payments: { backgroundColor: '#f5faf7', borderRadius: 12, padding: 10, gap: 4 },
})
