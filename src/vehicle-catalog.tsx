import { useId, useState } from 'react'
import catalog from './vehicle-catalog-data.json'

export type VehicleSpec = {
  id: string
  make: string
  model: string
  version: string
  engine?: string
  transmission?: string
  year: number
  fuel?: string
  tank?: number
  consumption?: Partial<Record<string, number[]>>
}

const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const nameOf = (item: VehicleSpec) => [item.make === 'VW' ? 'Volkswagen' : item.make, item.model, item.version].filter(Boolean).join(' ')
const nameAndYear = (item: VehicleSpec) => [nameOf(item), item.engine, item.transmission, item.year].filter(Boolean).join(' · ')
const specs = (catalog as VehicleSpec[]).map(item => ({
  item, terms: normalize(nameAndYear(item) + (item.make === 'VW' ? ' VW' : '')),
})).sort((a, b) => b.item.year - a.item.year)

type ModelYears = [motorcycle: boolean, code: string, make: string, model: string, years: [number, string][]]
let modelList: Promise<ModelYears[]> | undefined

function loadModels() {
  modelList ??= import('./vehicle-model-years.json').then(module => module.default as ModelYears[]).catch(error => {
    modelList = undefined
    throw error
  })
  return modelList
}

const availableYears = Array.from({ length: 28 }, (_, index) => 2027 - index)

export function VehicleModelField({ type, onSelect }: {
  type: 'car' | 'motorcycle'
  onSelect: (item: VehicleSpec | undefined) => void
}) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [year, setYear] = useState('')
  const [selected, setSelected] = useState<VehicleSpec>()
  const [show, setShow] = useState(false)
  const [models, setModels] = useState<ModelYears[]>([])
  const [catalogError, setCatalogError] = useState(false)

  function openSuggestions() {
    setShow(true)
    setCatalogError(false)
    if (!models.length) void loadModels().then(setModels, () => setCatalogError(true))
  }

  const words = normalize(query).split(' ').filter(Boolean)
  const yearFromQuery = words.find(word => /^20[0-2][0-9]$/.test(word))
  const filterYear = Number(year || yearFromQuery)
  const searchWords = words.filter(word => word !== yearFromQuery)
  const options: VehicleSpec[] = []
  if (show && !selected && searchWords.join('').length >= 2) {
    options.push(...specs.filter(({ item, terms }) => (type === 'car') === Boolean(item.consumption)
      && (!filterYear || filterYear === item.year) && searchWords.every(word => terms.includes(word)))
      .slice(0, 8).map(({ item }) => item))
    for (const [motorcycle, code, make, model, years] of models) {
      if (motorcycle !== (type === 'motorcycle')) continue
      const terms = normalize(make + ' ' + model + (/volkswagen/i.test(make) ? ' VW' : ''))
      if (!searchWords.every(word => terms.includes(word))) continue
      const match = filterYear ? years.find(([itemYear]) => itemYear === filterYear) : years[0]
      if (!match) continue
      const [itemYear, fuel] = match
      options.push({ id: 'fipe-' + code + '-' + itemYear, make, model, version: '', year: itemYear,
        fuel: fuel === 'D' ? 'Diesel' : fuel === 'E' ? 'Etanol' : 'Gasolina' })
      if (options.length >= 14) break
    }
  }

  return <>
    <label>Ano do veículo<select value={year} onChange={event => {
      setYear(event.target.value)
      if (selected) {
        setQuery(selected.make + ' ' + selected.model)
        setSelected(undefined)
        onSelect(undefined)
      }
      openSuggestions()
    }}>
      <option value="">Todos os anos disponíveis</option>
      {availableYears.map(item => <option key={item}>{item}</option>)}
    </select></label>
    <label htmlFor={id}>Modelo do veículo</label>
    <input id={id} name="name" autoComplete="off" maxLength={100} required
      placeholder={type === 'car' ? 'Ex. Onix, Polo ou HB20' : 'Ex. CG 160'}
      value={query} onFocus={openSuggestions} onChange={event => {
        setQuery(event.target.value)
        setShow(true)
        if (selected) {
          setSelected(undefined)
          onSelect(undefined)
        }
      }} onKeyDown={event => { if (event.key === 'Escape') setShow(false) }} />
    {selected && <input type="hidden" name="catalogId" value={selected.id} />}
    {options.length > 0 && <ul className="address-suggestions" aria-label="Sugestões de modelos e versões">
      {options.map(item => <li key={item.id}><button type="button" onClick={() => {
        setQuery(nameAndYear(item).slice(0, 100))
        setSelected(item)
        setShow(false)
        onSelect(item)
      }}>{nameAndYear(item)}{item.consumption ? ' · Consumo Inmetro' : ''}</button></li>)}
    </ul>}
    <small>{selected
      ? [selected.consumption && 'Consumo de referência do Inmetro.', selected.tank && 'Capacidade do tanque conforme a montadora.',
        !selected.tank && 'Capacidade do tanque disponível para preenchimento manual.'].filter(Boolean).join(' ')
      : catalogError ? 'Catálogo indisponível no momento. Você pode preencher os dados manualmente.'
      : 'Escolha o ano e digite o modelo, ou informe os dados manualmente.'}</small>
  </>
}
