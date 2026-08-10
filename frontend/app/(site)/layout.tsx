'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { LandingStyles } from '@/components/landing/LandingStyles'
import { SiteNav } from '@/components/landing/SiteNav'
import { SiteFooter } from '@/components/landing/blocks'
import { ToneSwitcher, TONES, type Tone } from '@/components/landing/ToneSwitcher'
import { useReveal } from '@/components/landing/useReveal'

/**
 * Casca do site público (home + páginas de conteúdo).
 *
 * Vive num grupo de rota `(site)` para não aparecer na URL: `/`, `/metodo`,
 * `/modulos/web`… O app autenticado segue em `(app)`, com a própria casca.
 *
 * O layout guarda o tom porque o App Router NÃO remonta layouts ao navegar
 * dentro do grupo — a cor escolhida sobrevive à troca de página sem piscar.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [tone, setTone] = useState<Tone>('lime')
  const path = usePathname()

  // a rota entra como chave: o layout não remonta ao navegar, então sem isto o
  // conteúdo da página nova ficaria marcado como oculto e nunca apareceria
  useReveal(rootRef, path)

  useEffect(() => {
    const saved = localStorage.getItem('rift.landing.tone')
    if (saved && TONES.some((t) => t.id === saved)) setTone(saved as Tone)
  }, [])

  const pickTone = (t: Tone) => {
    setTone(t)
    localStorage.setItem('rift.landing.tone', t)
  }

  return (
    <div className="rl" data-tom={tone} ref={rootRef}>
      <LandingStyles />
      <SiteNav />
      {children}
      <SiteFooter />
      {/* Temporário: validação dos três tons. Remover quando a cor for decidida. */}
      <ToneSwitcher value={tone} onChange={pickTone} />
    </div>
  )
}
