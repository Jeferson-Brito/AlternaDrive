import { useEffect, useMemo, useState } from 'react'
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native'
import { loadModels, nameAndYear, searchVehicles, type VehicleSpec } from '../../src/vehicle-catalog-search'
import { Button, Field, NumberField, ui } from './controls'
import { numeric } from './model'

type VehicleInput = {
  name: string; type: 'car' | 'motorcycle'; fuel: string; tank: number | null; cityEfficiency: number
  highwayEfficiency?: number; urbanShare: number; capacity: number; catalogId?: string
}
const fuels = ['Gasolina', 'Etanol', 'Diesel', 'GNV']
const decimal = (value?: number) => value === undefined ? '' : value.toFixed(2).replace('.', ',')

export function VehicleForm({ busy, save }: { busy: boolean; save: (vehicle: VehicleInput) => void }) {
  const [type, setType] = useState<'car' | 'motorcycle'>('car')
  const [year, setYear] = useState('')
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<VehicleSpec>()
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof loadModels>>>([])
  const [unavailable, setUnavailable] = useState(false)
  const [fuel, setFuel] = useState('Gasolina')
  const [tank, setTank] = useState('')
  const [city, setCity] = useState('')
  const [highway, setHighway] = useState('')
  const [capacity, setCapacity] = useState('')
  const [urbanShare, setUrbanShare] = useState(100)
  useEffect(() => { void loadModels().then(setCatalog, () => setUnavailable(true)) }, [])
  const options = useMemo(() => selected ? [] : searchVehicles(name, year.length === 4 ? year : '', type, catalog).slice(0, 8),
    [name, year, type, catalog, selected])

  function setReference(item: VehicleSpec | undefined, selectedFuel: string) {
    setFuel(selectedFuel)
    setCity(decimal(item?.consumption?.[selectedFuel]?.[0]))
    setHighway(decimal(item?.consumption?.[selectedFuel]?.[1]))
  }

  function select(item: VehicleSpec) {
    Keyboard.dismiss()
    setSelected(item)
    setName(nameAndYear(item).slice(0, 100))
    setYear(String(item.year))
    const nextFuel = item.fuel ?? (item.consumption?.[fuel] ? fuel : Object.keys(item.consumption ?? {})[0]) ?? fuel
    setTank(nextFuel === 'GNV' ? '' : decimal(item.tank))
    setReference(item, nextFuel)
  }

  function clearReference() {
    if (!selected) return
    setSelected(undefined)
    setTank('')
    setReference(undefined, fuel)
  }

  const useOptions = [{ share: 100, label: 'Cidade' }, { share: 75, label: 'Mais cidade' }, { share: 50, label: 'Misto' }, { share: 25, label: 'Mais estrada' }, { share: 0, label: 'Estrada' }]
  const cityEfficiency = numeric(city)
  const highwayEfficiency = highway ? numeric(highway) : undefined
  const passengerCapacity = type === 'motorcycle' ? 1 : numeric(capacity)
  const unit = fuel === 'GNV' ? 'm³' : 'L'
  return <View style={styles.form}>
    <Text style={ui.label}>Tipo de veículo</Text>
    <View style={styles.choices}>
      <Button title="Carro" secondary={type !== 'car'} onPress={() => { if (type !== 'car') { setType('car'); clearReference(); setName('') } }} />
      <Button title="Moto" secondary={type !== 'motorcycle'} onPress={() => { if (type !== 'motorcycle') { setType('motorcycle'); clearReference(); setName('') } }} />
    </View>
    <View style={styles.columns}>
      <View style={styles.name}>
        <Field label="Modelo do veículo" value={name} maxLength={100} autoCorrect={false}
          placeholder={type === 'motorcycle' ? 'Ex. CG 160' : 'Ex. Gol, Onix ou Polo'}
          onChangeText={text => { clearReference(); setName(text) }} />
      </View>
      <View style={styles.year}>
        <Field label="Ano" value={year} maxLength={4} keyboardType="number-pad" placeholder="Opcional"
          onChangeText={text => {
            if (selected) setName(selected.make + ' ' + selected.model)
            clearReference()
            setYear(text.replace(/\D/g, ''))
          }} />
      </View>
    </View>
    {options.length > 0 && <View style={styles.suggestions}>{options.map(item =>
      <Pressable key={item.id} accessibilityRole="button" onPress={() => select(item)} style={styles.item}>
        <Text style={ui.label}>{nameAndYear(item)}</Text>
        {!!item.consumption && <Text style={ui.muted}>Consumo Inmetro</Text>}
      </Pressable>)}</View>}
    <Text style={ui.muted}>{unavailable ? 'Catálogo indisponível. Você pode preencher manualmente.'
      : selected ? 'Modelo confirmado. Confira os dados disponíveis e complete os demais.'
      : 'Escolha uma sugestão ou preencha os dados manualmente.'}</Text>
    <Text style={ui.label}>Combustível</Text>
    <View style={styles.choices}>{fuels.map(item => <Button key={item} title={item} secondary={item !== fuel}
      onPress={() => {
        if (item === fuel) return
        if (item === 'GNV' || fuel === 'GNV') setTank(item === 'GNV' ? '' : decimal(selected?.tank))
        setReference(selected, item)
      }} />)}</View>
    <NumberField mode="decimal" label={'Capacidade do tanque (' + unit + ')'} value={tank} onChange={setTank} />
    <View style={styles.columns}>
      <View style={styles.name}><NumberField mode="decimal" label={'Cidade (km/' + unit + ')'} value={city} onChange={setCity} /></View>
      <View style={styles.name}><NumberField mode="decimal" label={'Estrada (km/' + unit + ')'} value={highway} onChange={setHighway} /></View>
    </View>
    {!!highway && <>
      <Text style={ui.label}>Uso na jornada</Text>
      <View style={styles.choices}>{useOptions.map(item => <Button key={item.share} title={item.label}
        secondary={item.share !== urbanShare} onPress={() => setUrbanShare(item.share)} />)}</View>
    </>}
    {type === 'car' && <NumberField label="Lugares para passageiros" value={capacity} onChange={setCapacity} />}
    <Button title={busy ? 'Aguarde…' : 'Cadastrar veículo'}
      disabled={busy || !name.trim() || !(cityEfficiency > 0) || !(passengerCapacity >= 1)}
      onPress={() => save({
        name, type, fuel, tank: tank ? numeric(tank) : null, cityEfficiency, highwayEfficiency,
        urbanShare, capacity: passengerCapacity, catalogId: selected?.id,
      })} />
  </View>
}

const styles = StyleSheet.create({
  form: { gap: 11 },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  name: { flex: 1, minWidth: 0 },
  year: { width: 98 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  suggestions: { borderWidth: 1, borderColor: '#cedfd6', borderRadius: 12, overflow: 'hidden' },
  item: { padding: 10, gap: 3, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#cedfd6', backgroundColor: '#f6faf8' },
})
