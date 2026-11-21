import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import type { Place } from './model'

export function Button({ title, onPress, disabled, secondary }: {
  title: string; onPress: () => void; disabled?: boolean; secondary?: boolean
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [ui.button, secondary && ui.secondary, (pressed || disabled) && ui.dim]}>
    <Text style={[ui.buttonText, secondary && ui.secondaryText]}>{title}</Text>
  </Pressable>
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={ui.field}><Text style={ui.label}>{label}</Text>
    <TextInput accessibilityLabel={label} placeholderTextColor="#667971" style={ui.input} {...props} /></View>
}

export function Address({ label, value, onChange }: { label: string; value: Place | null; onChange: (value: Place | null) => void }) {
  const [text, setText] = useState(value?.label ?? '')
  const [matches, setMatches] = useState<Place[]>([])
  const [hint, setHint] = useState('')
  useEffect(() => {
    setHint('')
    setMatches([])
    if (value || text.trim().length < 3) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const result = await fetch('https://photon.komoot.io/api/?limit=6&lang=pt&q=' + encodeURIComponent(text.trim()), { signal: controller.signal })
        if (!result.ok) throw new Error()
        const { features } = await result.json() as { features: { geometry: { coordinates: [number, number] }; properties: Record<string, string> }[] }
        if (controller.signal.aborted) return
        const places = features.map(({ properties: p, geometry }) => ({
          longitude: geometry.coordinates[0], latitude: geometry.coordinates[1],
          label: [...new Set([p.name, p.street, p.district, p.city, p.state].filter(Boolean))].join(' · ').slice(0, 240),
        })).filter(p => p.label)
        setMatches(places)
        if (!places.length) setHint('Nenhum endereço encontrado.')
      } catch {
        if (!controller.signal.aborted) setHint('Busca indisponível. Tente novamente.')
      }
    }, 450)
    return () => { clearTimeout(timer); controller.abort() }
  }, [text, value])

  return <View style={ui.field}>
    <Field label={label} value={text} onChangeText={input => { setText(input); onChange(null) }} />
    {!!hint && <Text style={ui.muted}>{hint}</Text>}
    {value && <Text style={ui.muted}>Local confirmado</Text>}
    {matches.map(place => <Button key={place.label + place.latitude + place.longitude} secondary title={place.label}
      onPress={() => { setText(place.label); onChange(place) }} />)}
  </View>
}

export const ui = StyleSheet.create({
  button: { minHeight: 49, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 13, backgroundColor: '#0b5a48', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: '800', textAlign: 'center', fontSize: 15 },
  secondary: { backgroundColor: '#e8f2ed' },
  secondaryText: { color: '#0b5a48' },
  dim: { opacity: .63 },
  field: { gap: 5 },
  label: { color: '#142d24', fontWeight: '700' },
  input: { minHeight: 49, fontSize: 16, color: '#142d24', paddingHorizontal: 12, backgroundColor: '#f6faf8', borderColor: '#c6d9ce', borderWidth: 1, borderRadius: 11 },
  muted: { color: '#526a60', fontSize: 13 },
})
