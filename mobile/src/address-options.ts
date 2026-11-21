import type { Place } from './model'

export type AddressOption = Place & { approximate?: boolean }

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')

export function includeTypedStreetNumber(query: string, place: Place): AddressOption {
  const [street, ...details] = place.label.split(' · ')
  // Only use a number that follows the matched street name, never a number inside the street name or the postal code.
  const input = normalize(query)
  const name = normalize(street)
  if (!input.startsWith(name) || /,\s*\d+[a-z]?$/i.test(street)) return place
  const number = input.slice(name.length).match(/^[ ,]+(?:(?:n[º°o.]?|numero)\s*)?(\d{1,5}[a-z]?)(?=$|[ ,])/i)?.[1]
  if (!number) return place

  return {
    ...place,
    label: [street + ', ' + number.toUpperCase(), ...details].join(' · ').slice(0, 240),
    approximate: true,
  }
}
