import { ScoreSlider } from '@rift/frontend'

// Medidor de score 0–100 do Rift — usado no score de segurança de um domínio /
// rede. Trilha com gradiente crítico→baixo fixo; o thumb e o rótulo assumem a
// `color` do nível atual. O eixo de variação é o nível de risco (cor + valor).

export const CriticalRisk = () => <ScoreSlider value={82} label="CRÍTICO" color="#F04452" />

export const HighRisk = () => <ScoreSlider value={63} label="ALTO" color="#F5892E" />

export const MediumRisk = () => <ScoreSlider value={44} label="MÉDIO" color="#EAB308" />

export const LowRisk = () => <ScoreSlider value={12} label="BAIXO" color="#22C55E" />

// Sem rótulo — só o número + a trilha.
export const NoLabel = () => <ScoreSlider value={57} color="#7C3AED" />
