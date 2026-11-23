import { Pressable, StyleSheet, View } from 'react-native'
import { Icon, type IconName } from './operation-ui'
import { Text } from './type'

function Role({ title, description, icon, action, onPress }: {
  title: string; description: string; icon: IconName; action: string; onPress: () => void
}) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.role, pressed && styles.pressed]}>
    <View style={styles.icon}><Icon name={icon} size={23} /></View>
    <View style={styles.copy}>
      <Text style={styles.roleTitle}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <Text style={styles.action}>{action}</Text>
    </View>
    <Icon name="right" size={17} />
  </Pressable>
}

export function Welcome({ onDriver, onPassenger }: { onDriver: () => void; onPassenger: () => void }) {
  return <View style={styles.welcome}>
    <Text style={styles.title} accessibilityRole="header">Transporte alternativo no seu mapa</Text>
    <Role title="Sou motorista" icon="car" action="Entrar ou criar conta"
      description="Organize sua rota, registre embarques e veja quanto sobrou no fim do dia." onPress={onDriver} />
    <Role title="Sou passageiro" icon="route" action="Abrir mapa sem cadastro"
      description="Veja veículos em jornada e previsões de chegada quando disponíveis. Permita a localização para detectar sua parada."
      onPress={onPassenger} />
  </View>
}

const styles = StyleSheet.create({
  welcome: { gap: 12 },
  title: { color: '#16372e', fontSize: 25, lineHeight: 30, fontWeight: '800', marginBottom: 2 },
  role: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 16, borderWidth: 1,
    borderColor: '#e0ede6', backgroundColor: '#f5faf7', padding: 12, minHeight: 90 },
  pressed: { backgroundColor: '#e6f2eb' },
  icon: { width: 39, height: 39, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e1efe8' },
  copy: { flex: 1, gap: 3 },
  roleTitle: { color: '#15392f', fontWeight: '800', fontSize: 17 },
  description: { color: '#4b675d', fontSize: 13, lineHeight: 17 },
  action: { color: '#0b5a48', fontWeight: '800', fontSize: 13, marginTop: 3 },
})
