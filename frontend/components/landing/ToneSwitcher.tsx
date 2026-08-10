'use client'

/**
 * Seletor de tom da home — TEMPORÁRIO.
 *
 * Existe só para validar qual dos três acentos fica melhor antes de a decisão
 * virar token em `globals.css`. Quando a cor for escolhida: apagar este
 * componente, apagar o `data-tom` de `app/page.tsx` e deixar um único bloco de
 * tokens em `LandingStyles.tsx`.
 */

export const TONES = [
  { id: 'lime', label: 'Lime', swatch: '#CCFF00' },
  { id: 'laranja', label: 'Laranja', swatch: '#FF4D1C' },
  { id: 'roxo', label: 'Roxo', swatch: '#7C3AED' },
] as const

export type Tone = (typeof TONES)[number]['id']

export function ToneSwitcher({ value, onChange }: {
  value: Tone
  onChange: (t: Tone) => void
}) {
  return (
    <div className="tomsel" role="group" aria-label="Tom da página">
      <span>Tom</span>
      {TONES.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          aria-pressed={value === t.id}
          aria-label={t.label}
          title={t.label}
          style={{ background: t.swatch }}
        />
      ))}
    </div>
  )
}
