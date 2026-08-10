import { HBars } from '@rift/frontend'

// Barras horizontais do Rift — ranking simples por valor (ex.: "Domínios por
// tipo"). Cada item é { label, value, color? }; a barra maior define a escala,
// ou passe `max`. `unit` sufixa o valor; `showVal` liga/desliga o número.

export const DomainsByKind = () => (
  <HBars
    data={[
      { label: 'Fornecedor', value: 22, color: '#A78BFA' },
      { label: 'Parceiro', value: 9, color: '#3B82F6' },
      { label: 'Interno', value: 7, color: '#22C55E' },
      { label: 'Outro', value: 3, color: '#71768C' },
    ]}
  />
)

export const ExposuresBySeverity = () => (
  <HBars
    unit=" achados"
    data={[
      { label: 'Crítico', value: 2, color: '#F04452' },
      { label: 'Alto', value: 6, color: '#F5892E' },
      { label: 'Médio', value: 11, color: '#EAB308' },
      { label: 'Baixo', value: 18, color: '#22C55E' },
    ]}
  />
)

// Cor única (default var(--purple)) + escala fixa via `max`.
export const SingleColorWithMax = () => (
  <HBars
    max={100}
    unit="%"
    data={[
      { label: 'Recon', value: 100 },
      { label: 'Enumeração', value: 72 },
      { label: 'Exploração', value: 40 },
      { label: 'Pós-exploração', value: 8 },
    ]}
  />
)
