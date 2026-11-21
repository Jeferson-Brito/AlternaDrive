import { isRunningInExpoGo } from 'expo'

export const isExpoGo = isRunningInExpoGo() || (__DEV__ && process.env.EXPO_PUBLIC_EXPO_GO_PREVIEW === '1')
