'use client'
import dynamic from 'next/dynamic'
import { Suspense } from 'react'

// react-force-graph usa canvas/window no import → carregar só no cliente (ssr:false).
// Toda a experiência vive em MapaView (import estático da lib lá dentro → refs e
// callbacks funcionam sem o problema de ref-forwarding do next/dynamic).
const MapaView = dynamic(() => import('@/components/mapa/MapaView'), {
  ssr: false,
  loading: () => <Loading />,
})

function Loading() {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-mute)', fontSize: 12, letterSpacing: '0.14em' }}>
      CARREGANDO MAPA…
    </div>
  )
}

export default function MapaPage() {
  // Suspense: MapaView lê ?domain= via useSearchParams.
  return (
    <Suspense fallback={<Loading />}>
      <MapaView />
    </Suspense>
  )
}
