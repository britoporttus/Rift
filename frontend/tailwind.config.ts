import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#080810',
        surface: '#0F0F1A',
        border: '#2D2D4E',
        purple: {
          DEFAULT: '#7C3AED',
          light: '#A78BFA',
          glow: 'rgba(124,58,237,0.15)',
        },
        critical: '#EF4444',
        high: '#F97316',
        medium: '#EAB308',
        low: '#22C55E',
        info: '#3B82F6',
        muted: '#94A3B8',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
