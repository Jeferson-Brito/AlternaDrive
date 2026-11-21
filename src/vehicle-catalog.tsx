import { useId, useState } from 'react'
import { availableYears, loadModels, nameAndYear, searchVehicles, type VehicleSpec } from './vehicle-catalog-search'
export type { VehicleSpec } from './vehicle-catalog-search'

export function VehicleModelField({ type, onSelect }: {
  type: 'car' | 'motorcycle'
  onSelect: (item: VehicleSpec | undefined) => void
}) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [year, setYear] = useState('')
  const [selected, setSelected] = useState<VehicleSpec>()
  const [show, setShow] = useState(false)
  const [models, setModels] = useState<Awaited<ReturnType<typeof loadModels>>>([])
  const [catalogError, setCatalogError] = useState(false)

  function openSuggestions() {
    setShow(true)
    setCatalogError(false)
    if (!models.length) void loadModels().then(setModels, () => setCatalogError(true))
  }

  const options = show && !selected ? searchVehicles(query, year, type, models) : []

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
