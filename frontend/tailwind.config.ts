import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0A0A12',
        surface: '#111119',
        surface2: '#16161F',
        raised: '#1A1A24',
        border: '#2D2D4E',
        purple: {
          DEFAULT: '#7C3AED',
          light: '#A78BFA',
          dark: '#6D28D9',
          glow: 'rgba(124,58,237,0.10)',
          glowStrong: 'rgba(124,58,237,0.35)',
        },
        critical: '#F04452',
        high: '#F5892E',
        medium: '#EAB308',
        low: '#22C55E',
        info: '#3B82F6',
        muted: '#A6ACC0',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
