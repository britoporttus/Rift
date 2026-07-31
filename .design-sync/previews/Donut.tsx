import { Donut } from '@rift/frontend'

// Gráfico de rosca do Rift — usado no painel de Domínios para compor totais por
// categoria (ex.: findings por severidade). O centro mostra o total; cada fatia
// é uma { key, label, value, color }. Cores = paleta de severidade do Rift.
const SEV = { critical: '#F04452', high: '#F5892E', medium: '#EAB308', low: '#22C55E' }

export const FindingsBySeverity = () => (
  <Donut
    caption="findings"
    data={[
      { key: 'critical', label: 'Crítico', value: 2, color: SEV.critical },
      { key: 'high', label: 'Alto', value: 5, color: SEV.high },
      { key: 'medium', label: 'Médio', value: 9, color: SEV.medium },
      { key: 'low', label: 'Baixo', value: 14, color: SEV.low },
    ]}
  />
)

export const DomainsByKind = () => (
  <Donut
    caption="domínios"
    total={38}
    data={[
      { key: 'vendor', label: 'Fornecedor', value: 22, color: '#A78BFA' },
      { key: 'partner', label: 'Parceiro', value: 9, color: '#3B82F6' },
      { key: 'internal', label: 'Interno', value: 7, color: '#22C55E' },
    ]}
  />
)

// Fatia em destaque (activeKey) — o estado interativo usado ao passar o mouse.
export const WithActiveSlice = () => (
  <Donut
    caption="ativos"
    activeKey="alive"
    data={[
      { key: 'alive', label: 'Vivos', value: 31, color: '#7C3AED' },
      { key: 'dormant', label: 'Sem resposta', value: 12, color: '#4A4F66' },
    ]}
  />
)
