import { createContext, useContext, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { Icon } from './operation-ui'
import { Text } from './type'

type Step = { title: string; body: string }
type Guide = { step: number; steps: Step[]; next: () => void; skip: () => void; reveal: (view: ComponentRef<typeof View>) => void }
const GuideContext = createContext<Guide | null>(null)

export const tutorials: Record<string, Step[]> = {
  vehicle: [
    { title: 'Seu veículo de trabalho', body: 'Escolha carro ou moto. Você pode cadastrar outros veículos depois.' },
    { title: 'Modelo e ano', body: 'Digite o modelo e toque numa sugestão para preencher os dados disponíveis. Você também pode digitar tudo.' },
    { title: 'Combustível e tanque', body: 'Informe o combustível usado e, se souber, a capacidade do tanque.' },
    { title: 'Consumo e lugares', body: 'O consumo ajuda a calcular os gastos da jornada. No carro, informe quantos passageiros você pode levar.' },
  ],
  route: [
    { title: 'Defina sua partida', body: 'Procure o endereço e escolha uma sugestão para fixar o Ponto A no mapa.' },
    { title: 'Escolha o destino', body: 'Faça o mesmo para o Ponto B. Você pode editar os dois pontos pela tela inicial.' },
    { title: 'Defina a tarifa', body: 'Informe quanto cada passageiro paga. O app aplica esse valor aos embarques.' },
  ],
  start: [
    { title: 'Confira o percurso', body: 'Aqui estão os pontos e a tarifa que você definiu. Fora do Ponto A, o app pode navegar até ele.' },
    { title: 'Escolha o veículo', body: 'Selecione o veículo que vai usar nesta jornada.' },
    { title: 'Informe a leitura inicial', body: 'Use o número do painel do veículo. O GPS estima quanto você rodou e sugere a leitura final.' },
    { title: 'Escolha de onde partir', body: 'Ative se quiser usar sua localização como origem desta jornada.' },
  ],
  fuel: [{ title: 'Registre o abastecimento', body: 'Escolha o veículo e informe o total pago e o preço por litro ou m³.' }],
  expense: [{ title: 'Adicione um gasto', body: 'Dê um nome à despesa, como pedágio ou estacionamento, e informe o valor pago.' }],
  finish: [{ title: 'Confira antes de encerrar', body: 'O GPS sugere o hodômetro final. Você pode corrigir a leitura antes de confirmar o cálculo dos custos.' }],
  report: [{ title: 'Explore seu resultado', body: 'Escolha um período e toque em um dia no gráfico para ver o faturamento, os gastos e o lucro.' }],
  menu: [{ title: 'Encontre os atalhos', body: 'Seu perfil, relatórios, percurso, veículos e lançamentos ficam reunidos aqui.' }],
  profile: [{ title: 'Personalize seu perfil', body: 'Edite seu nome, escolha a cor do carro no mapa ou ajuste seus veículos.' }],
  group: [{ title: 'Registre um grupo', body: 'Informe quantos passageiros embarcaram juntos. A tarifa se aplica a cada pessoa.' }],
  suggestions: [{ title: 'Revise embarques sugeridos', body: 'Confirme se houve um embarque que você ainda não registrou. Você pode desfazer uma confirmação.' }],
}

export function TutorialScroll({ guide, owner, children, ...props }: ScrollViewProps & {
  guide?: string | null; owner?: string; children: ReactNode
}) {
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null)
  const content = useRef<ComponentRef<typeof View>>(null)
  const [index, setIndex] = useState<number | null>(null)
  const steps = guide ? tutorials[guide] : undefined
  const storageKey = steps && 'alternadrive.guide.' + (owner ?? 'device') + '.' + guide
  useEffect(() => {
    if (!storageKey) return
    let alive = true
    void SecureStore.getItemAsync(storageKey).then(value => {
      if (alive && value !== 'seen') setIndex(0)
    }).catch(() => undefined)
    return () => { alive = false }
  }, [storageKey])

  function finish() {
    setIndex(null)
    if (storageKey) void SecureStore.setItemAsync(storageKey, 'seen').catch(() => undefined)
  }

  const state: Guide | null = steps && index !== null ? {
    step: index, steps,
    next: () => index + 1 < steps.length ? setIndex(index + 1) : finish(),
    skip: finish,
    reveal: view => {
      if (!content.current) return
      view.measureLayout(content.current, (_, y) => scroller.current?.scrollTo({ y: Math.max(0, y - 10), animated: true }))
    },
  } : null
  return <ScrollView {...props} ref={scroller}>
    <View ref={content} collapsable={false} style={styles.content}>
      <GuideContext.Provider value={state}>{children}</GuideContext.Provider>
    </View>
  </ScrollView>
}

export function GuideTip({ step = 0 }: { step?: number }) {
  const guide = useContext(GuideContext)
  const anchor = useRef<ComponentRef<typeof View>>(null)
  const shown = guide?.step === step
  useEffect(() => {
    if (!shown || step === 0) return
    const timer = setTimeout(() => { if (anchor.current) guide?.reveal(anchor.current) }, 100)
    return () => clearTimeout(timer)
  }, [shown, step])
  if (!shown || !guide) return null
  const { title, body } = guide.steps[step]
  return <View ref={anchor} collapsable={false} style={styles.tip}>
    <View style={styles.heading}>
      <Icon name="help" color="#19518e" size={19} />
      <Text style={styles.title}>{title}</Text>
      {guide.steps.length > 1 && <Text style={styles.count}>{step + 1}/{guide.steps.length}</Text>}
    </View>
    <Text style={styles.body}>{body}</Text>
    <View style={styles.actions}>
      {guide.steps.length > 1 && <Pressable accessibilityRole="button" style={styles.action} onPress={guide.skip}>
        <Text style={styles.actionText}>Pular dicas</Text>
      </Pressable>}
      <Pressable accessibilityRole="button" style={[styles.action, styles.next]} onPress={guide.next}>
        <Text style={[styles.actionText, styles.nextText]}>{step + 1 < guide.steps.length ? 'Próxima dica' : 'Entendi'}</Text>
      </Pressable>
    </View>
    <View pointerEvents="none" style={styles.pointer} />
  </View>
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  tip: { gap: 6, borderRadius: 16, padding: 12, marginBottom: 6, backgroundColor: '#e8f3ff' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { color: '#173b67', flex: 1, fontWeight: '800', fontSize: 15 },
  count: { color: '#3c638a', fontSize: 12, fontWeight: '700' },
  body: { color: '#294e71', fontSize: 14, lineHeight: 19 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  action: { minHeight: 40, borderRadius: 10, justifyContent: 'center', paddingHorizontal: 10 },
  actionText: { color: '#19518e', fontWeight: '800' },
  next: { backgroundColor: '#19518e' },
  nextText: { color: '#fff' },
  pointer: { position: 'absolute', bottom: -5, left: 23, width: 11, height: 11, backgroundColor: '#e8f3ff', transform: [{ rotate: '45deg' }] },
})
