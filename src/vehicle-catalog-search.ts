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
export const nameAndYear = (item: VehicleSpec) => [nameOf(item), item.engine, item.transmission, item.year].filter(Boolean).join(' · ')
const specs = (catalog as VehicleSpec[]).map(item => ({
  item, terms: normalize(nameAndYear(item) + (item.make === 'VW' ? ' VW' : '')),
})).sort((a, b) => b.item.year - a.item.year)

type ModelYears = [motorcycle: boolean, code: string, make: string, model: string, years: [number, string][]]
let modelList: Promise<ModelYears[]> | undefined

export function loadModels() {
  modelList ??= import('./vehicle-model-years.json').then(module => module.default as ModelYears[]).catch(error => {
    modelList = undefined
    throw error
  })
  return modelList
}

export const availableYears = Array.from({ length: 28 }, (_, index) => 2027 - index)

export function searchVehicles(query: string, year: string, type: 'car' | 'motorcycle', models: ModelYears[]) {
  const words = normalize(query).split(' ').filter(Boolean)
  const yearFromQuery = words.find(word => /^20[0-2][0-9]$/.test(word))
  const filterYear = Number(year || yearFromQuery)
  const searchWords = words.filter(word => word !== yearFromQuery)
  const options: VehicleSpec[] = []
  if (searchWords.join('').length >= 2) {
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

  return options
}
