import * as Location from 'expo-location'
import { findAddresses } from '../../src/address-search'
import { api, ApiError } from './api'
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

async function searchOnlineAddresses(query: string, token: string, signal: AbortSignal) {
  const proxy = new AbortController()
  const abortProxy = () => proxy.abort()
  signal.addEventListener('abort', abortProxy)
  if (signal.aborted) abortProxy()
  const timeout = setTimeout(abortProxy, 6500)
  try {
    return await api<Place[]>('addresses?q=' + encodeURIComponent(query), undefined, token, proxy.signal)
  } catch (error) {
    if (signal.aborted || (error instanceof ApiError && error.status < 500 && error.status !== 401)) throw error
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener('abort', abortProxy)
  }
  return findAddresses('api/', {
    q: query, limit: '6', lat: '-7.132', lon: '-34.871', countrycode: 'BR',
  }, signal)
}

async function searchDeviceAddresses(query: string): Promise<Place[]> {
  const existing = await Location.getForegroundPermissionsAsync()
  const permission = existing.granted || !existing.canAskAgain ? existing : await Location.requestForegroundPermissionsAsync()
  if (!permission.granted) throw new Error('Permita a localização para usar a busca do Android.')
  const localQuery = /jo[aã]o pessoa|cabedelo|para[ií]ba|,/.test(query.toLowerCase())
    ? query : query + ', João Pessoa, Paraíba'
  const matches = await Location.geocodeAsync(localQuery)
  return matches.slice(0, 5).map(({ latitude, longitude }) => ({
    latitude, longitude, label: localQuery.slice(0, 240),
  }))
}

export async function searchRouteAddresses(query: string, token: string, signal: AbortSignal) {
  const online = new AbortController()
  const cancel = () => online.abort()
  signal.addEventListener('abort', cancel)
  if (signal.aborted) cancel()
  const timeout = setTimeout(cancel, 10_000)
  try {
    return await searchOnlineAddresses(query, token, online.signal)
  } catch (error) {
    if (signal.aborted) throw error
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener('abort', cancel)
  }
  return searchDeviceAddresses(query)
}
