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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
