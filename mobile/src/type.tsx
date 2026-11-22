import { StyleSheet, Text as NativeText, type TextProps } from 'react-native'

export const regularFont = 'Nunito_400Regular'

export function Text({ style, ...props }: TextProps) {
  const weight = Number(StyleSheet.flatten(style)?.fontWeight ?? 400)
  const fontFamily = weight >= 800 ? 'Nunito_800ExtraBold' : weight >= 600 ? 'Nunito_700Bold' : regularFont
  return <NativeText {...props} style={[style, { fontFamily, fontWeight: 'normal' }]} />
}
