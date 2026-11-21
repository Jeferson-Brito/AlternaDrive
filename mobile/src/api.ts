import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

const sessionKey = 'alternadrive.session'
const origin = (process.env.EXPO_PUBLIC_API_URL || (__DEV__ && Platform.OS === 'android' ? 'http://10.0.2.2:3001' : '')).replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

export const readSession = () => SecureStore.getItemAsync(sessionKey)
export const clearSession = () => SecureStore.deleteItemAsync(sessionKey)

export async function api<T = unknown>(path: string, body?: object, token?: string | null, signal?: AbortSignal): Promise<T> {
  if (!origin || (!__DEV__ && !origin.startsWith('https://'))) {
    throw new Error('Configure o endereço HTTPS do servidor do AlternaDrive.')
  }
  const response = await fetch(origin + '/api/' + path, {
    signal,
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'X-AlternaDrive-Client': 'android',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) throw new ApiError(data?.error || 'Servidor indisponível. Tente novamente.', response.status)
  return data as T
}

export async function authenticate(path: 'register' | 'login', body: object) {
  const { token } = await api<{ token: string }>(path, body)
  await SecureStore.setItemAsync(sessionKey, token)
  return token
}
