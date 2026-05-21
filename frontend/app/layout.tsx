import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Rift — AI Pentest Platform',
  description: 'Plataforma de pentest com IA',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
