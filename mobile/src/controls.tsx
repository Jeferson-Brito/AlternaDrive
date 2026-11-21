import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import { api } from './api'
import { includeTypedStreetNumber, type AddressOption } from './address-options'
import { formatNumberDigits } from '../../src/localized-number'
import type { Place } from './model'

export function Button({ title, onPress, disabled, secondary, accessibilityLabel }: {
  title: string; onPress: () => void; disabled?: boolean; secondary?: boolean; accessibilityLabel?: string
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [ui.button, secondary && ui.secondary, (pressed || disabled) && ui.dim]}>
    <Text style={[ui.buttonText, secondary && ui.secondaryText]}>{title}</Text>
  </Pressable>
}

export function Field({ label, trailing, ...props }: TextInputProps & { label: string; trailing?: ReactNode }) {
  return <View style={ui.field}>
    <Text style={ui.label}>{label}</Text>
    <View>
      <TextInput accessibilityLabel={label} placeholderTextColor="#667971" style={[ui.input, !!trailing && ui.inputTrailing]} {...props} />
      {!!trailing && <View style={ui.trailing}>{trailing}</View>}
    </View>
  </View>
}

export function NumberField({ label, mode = 'integer', value, onChange, hint }: {
  label: string; mode?: 'integer' | 'money' | 'decimal' | 'odometer'; value: string
  onChange: (value: string) => void; hint?: string
}) {
  const odometer = mode === 'odometer'
  const explicitDecimal = odometer || mode === 'decimal'
  const fractional = mode !== 'integer'
  return <View style={ui.field}>
    <Text style={ui.label}>{label}</Text>
    {!!hint && <Text style={ui.muted}>{hint}</Text>}
    <View style={ui.numberInput}>
      {mode === 'money' && <Text style={ui.numberPrefix}>R$</Text>}
      <TextInput accessibilityLabel={label} placeholder={odometer ? 'Ex. 8,4' : fractional ? '0,00' : '0'} placeholderTextColor="#667971"
        style={ui.numberValue} value={value} keyboardType={explicitDecimal ? 'decimal-pad' : 'number-pad'} maxLength={16}
        onChangeText={input => onChange(explicitDecimal ? input : value === '0,00' && input.length < value.length ? '' : formatNumberDigits(input, fractional))} />
    </View>
  </View>
}

export function Address({ label, placeholder, value, onChange, token }: { label: string; placeholder?: string; value: Place | null; onChange: (value: Place | null) => void; token: string }) {
  const [text, setText] = useState(value?.label ?? '')
  const [matches, setMatches] = useState<AddressOption[]>([])
  const [approximate, setApproximate] = useState(false)
  const [hint, setHint] = useState('')
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    setHint('')
    setFailed(false)
    setMatches([])
    if (value || text.trim().length < 3 || text.trim().length > 240) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setHint('Buscando endereços…')
      const timeout = setTimeout(() => {
        if (!controller.signal.aborted) {
          setHint('Busca indisponível. Tente novamente.')
          setFailed(true)
          controller.abort()
        }
      }, 16000)
      try {
        const places = await api<Place[]>('addresses?q=' + encodeURIComponent(text.trim()), undefined, token, controller.signal)
        if (controller.signal.aborted) return
        setMatches(places.map(place => includeTypedStreetNumber(text, place)))
        setHint(places.length ? '' : 'Sem sugestões. Tente incluir o bairro ou a cidade.')
      } catch {
        if (!controller.signal.aborted) {
          setHint('Busca indisponível. Tente novamente.')
          setFailed(true)
        }
      } finally {
        clearTimeout(timeout)
      }
    }, 450)
    return () => { clearTimeout(timer); controller.abort() }
  }, [text, value, retry, token])

  return <View style={ui.field}>
    <Field label={label} placeholder={placeholder} value={text} maxLength={240} autoCorrect={false} onChangeText={input => { setText(input); setApproximate(false); onChange(null) }} />
    {!!hint && <Text style={ui.muted}>{hint}</Text>}
    {failed && <Button title="Tentar busca novamente" secondary onPress={() => setRetry(value => value + 1)} />}
    {value && <Text style={approximate ? ui.approximate : ui.confirmed}>{approximate ? 'Número informado · localização aproximada na rua' : '✓ Endereço selecionado'}</Text>}
    {matches.length > 0 && <View style={ui.addressOptions}>
      {matches.map(place => {
        const [name, ...details] = place.label.split(' · ')
        return <Pressable key={place.label + place.latitude + place.longitude}
          accessibilityRole="button" accessibilityLabel={place.approximate ? place.label + '. Localização aproximada na rua.' : place.label}
          style={({ pressed }) => [ui.addressOption, pressed && ui.secondary]}
          onPress={() => { setText(place.label); setApproximate(Boolean(place.approximate)); onChange(place) }}>
          <Text style={ui.label}>{name}</Text>
          {details.length > 0 && <Text style={ui.muted}>{details.join(' · ')}</Text>}
          {place.approximate && <Text style={ui.approximate}>Localização aproximada na rua</Text>}
        </Pressable>
      })}
    </View>}
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
  inputTrailing: { paddingRight: 52 },
  trailing: { position: 'absolute', top: 0, bottom: 0, right: 4, justifyContent: 'center' },
  numberInput: { flexDirection: 'row', alignItems: 'center', minHeight: 49, paddingHorizontal: 12, backgroundColor: '#f6faf8', borderColor: '#c6d9ce', borderWidth: 1, borderRadius: 11 },
  numberPrefix: { color: '#526a60', fontWeight: '700', marginRight: 8 },
  numberValue: { flex: 1, minHeight: 46, fontSize: 16, color: '#142d24', padding: 0, fontVariant: ['tabular-nums'] },
  approximate: { color: '#785320', fontWeight: '600', fontSize: 12 },
  confirmed: { color: '#0b5a48', fontWeight: '700', fontSize: 12 },
  addressOptions: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d8e7df', borderRadius: 11, overflow: 'hidden' },
  addressOption: { gap: 2, paddingHorizontal: 10, paddingVertical: 9, minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e0ebe5' },
  muted: { color: '#526a60', fontSize: 13 },
})
