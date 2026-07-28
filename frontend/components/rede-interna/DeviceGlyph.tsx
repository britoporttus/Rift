'use client'
import type { DeviceType } from '@/lib/api'

// Glyphs SVG desenhados à mão, um por tipo de dispositivo — mais evocativos que os
// ícones de linha genéricos (servidor = rack, firewall = muro de tijolos, ESXi =
// pilha de camadas...). Usados no diagrama estruturado da rede. `color` é o accent
// (borda/detalhe); o corpo usa tons neutros pra ficar legível no tema escuro.
export function DeviceGlyph({ type, size = 40, color = '#A78BFA' }: { type: DeviceType; size?: number; color?: string }) {
  const common = { width: size, height: size, viewBox: '0 0 48 48', fill: 'none' as const }
  const body = 'var(--raised)'
  const line = color
  const dim = 'var(--text-mute)'

  switch (type) {
    case 'server':
      return (
        <svg {...common}>
          <rect x="12" y="7" width="24" height="34" rx="2" fill={body} stroke={line} strokeWidth="1.6" />
          {[13, 22, 31].map((y) => (
            <g key={y}>
              <rect x="15" y={y} width="18" height="5" rx="1" fill="none" stroke={dim} strokeWidth="1" />
              <circle cx="18" cy={y + 2.5} r="1" fill={line} />
              <line x1="22" y1={y + 2.5} x2="30" y2={y + 2.5} stroke={dim} strokeWidth="1" />
            </g>
          ))}
        </svg>
      )
    case 'hypervisor':
      return (
        <svg {...common}>
          {[26, 20, 14].map((y, i) => (
            <g key={y}>
              <rect x="9" y={y} width="30" height="9" rx="2" fill={body} stroke={i === 2 ? line : dim} strokeWidth={i === 2 ? 1.8 : 1.2} />
              <circle cx="13.5" cy={y + 4.5} r="1.3" fill={i === 2 ? line : dim} />
            </g>
          ))}
        </svg>
      )
    case 'firewall':
      return (
        <svg {...common}>
          <rect x="8" y="12" width="32" height="24" rx="2" fill={body} stroke={line} strokeWidth="1.6" />
          {[[8, 18], [8, 30]].map(([x, y], r) => (
            <line key={r} x1={x} y1={y} x2="40" y2={y} stroke={line} strokeWidth="1.1" />
          ))}
          <line x1="24" y1="12" x2="24" y2="18" stroke={line} strokeWidth="1.1" />
          <line x1="16" y1="18" x2="16" y2="24" stroke={line} strokeWidth="1.1" />
          <line x1="32" y1="18" x2="32" y2="24" stroke={line} strokeWidth="1.1" />
          <line x1="20" y1="24" x2="20" y2="30" stroke={line} strokeWidth="1.1" />
          <line x1="28" y1="24" x2="28" y2="30" stroke={line} strokeWidth="1.1" />
          <line x1="16" y1="30" x2="16" y2="36" stroke={line} strokeWidth="1.1" />
          <line x1="32" y1="30" x2="32" y2="36" stroke={line} strokeWidth="1.1" />
        </svg>
      )
    case 'router':
      return (
        <svg {...common}>
          <rect x="8" y="24" width="32" height="13" rx="3" fill={body} stroke={line} strokeWidth="1.6" />
          <circle cx="14" cy="30.5" r="1.4" fill={line} />
          <circle cx="19" cy="30.5" r="1.4" fill={dim} />
          <path d="M18 20 L24 12 L30 20" stroke={line} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M24 12 L24 24" stroke={line} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M31 16 h5 M33 13 v6" stroke={dim} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )
    case 'switch':
      return (
        <svg {...common}>
          <rect x="6" y="19" width="36" height="12" rx="2" fill={body} stroke={line} strokeWidth="1.6" />
          {[10, 15, 20, 25, 30, 35].map((x) => (
            <rect key={x} x={x} y="24" width="3.4" height="3.4" rx="0.6" fill="none" stroke={dim} strokeWidth="1" />
          ))}
          <circle cx="10.5" cy="21.5" r="0.9" fill={line} />
        </svg>
      )
    case 'workstation':
      return (
        <svg {...common}>
          <rect x="8" y="10" width="32" height="21" rx="2" fill={body} stroke={line} strokeWidth="1.6" />
          <line x1="20" y1="35" x2="28" y2="35" stroke={line} strokeWidth="2" strokeLinecap="round" />
          <line x1="24" y1="31" x2="24" y2="35" stroke={dim} strokeWidth="1.4" />
          <line x1="12" y1="27" x2="36" y2="27" stroke={dim} strokeWidth="1" />
        </svg>
      )
    case 'printer':
      return (
        <svg {...common}>
          <rect x="14" y="9" width="20" height="9" rx="1" fill="none" stroke={dim} strokeWidth="1.2" />
          <rect x="10" y="18" width="28" height="14" rx="2" fill={body} stroke={line} strokeWidth="1.6" />
          <rect x="15" y="30" width="18" height="9" rx="1" fill={body} stroke={dim} strokeWidth="1.2" />
          <circle cx="33" cy="23" r="1.3" fill={line} />
        </svg>
      )
    case 'camera':
      return (
        <svg {...common}>
          <rect x="10" y="18" width="24" height="12" rx="4" fill={body} stroke={line} strokeWidth="1.6" />
          <circle cx="16" cy="24" r="3.4" fill="none" stroke={line} strokeWidth="1.4" />
          <path d="M34 21 L40 18 M34 27 L40 30" stroke={dim} strokeWidth="1.4" strokeLinecap="round" />
          <line x1="22" y1="30" x2="22" y2="36" stroke={dim} strokeWidth="1.4" />
        </svg>
      )
    case 'nas':
      return (
        <svg {...common}>
          <rect x="13" y="8" width="22" height="32" rx="2" fill={body} stroke={line} strokeWidth="1.6" />
          {[12, 19, 26].map((y) => (
            <g key={y}>
              <rect x="17" y={y} width="14" height="5" rx="1" fill="none" stroke={dim} strokeWidth="1" />
              <circle cx="28" cy={y + 2.5} r="1" fill={line} />
            </g>
          ))}
        </svg>
      )
    case 'voip':
      return (
        <svg {...common}>
          <rect x="9" y="20" width="30" height="16" rx="2" fill={body} stroke={line} strokeWidth="1.6" />
          <path d="M16 20 q8 -10 16 0" fill="none" stroke={line} strokeWidth="1.6" />
          <rect x="14" y="26" width="8" height="6" rx="1" fill="none" stroke={dim} strokeWidth="1" />
          {[26, 30, 34].map((x) => <circle key={x} cx={x} cy="28" r="1" fill={dim} />)}
        </svg>
      )
    case 'iot':
      return (
        <svg {...common}>
          <rect x="15" y="15" width="18" height="18" rx="2" fill={body} stroke={line} strokeWidth="1.6" />
          <rect x="20" y="20" width="8" height="8" rx="1" fill="none" stroke={dim} strokeWidth="1.2" />
          {[19, 24, 29].map((p) => (
            <g key={p}>
              <line x1={p} y1="15" x2={p} y2="11" stroke={dim} strokeWidth="1.1" />
              <line x1={p} y1="33" x2={p} y2="37" stroke={dim} strokeWidth="1.1" />
              <line x1="15" y1={p} x2="11" y2={p} stroke={dim} strokeWidth="1.1" />
              <line x1="33" y1={p} x2="37" y2={p} stroke={dim} strokeWidth="1.1" />
            </g>
          ))}
        </svg>
      )
    case 'mobile':
      return (
        <svg {...common}>
          <rect x="16" y="8" width="16" height="32" rx="3" fill={body} stroke={line} strokeWidth="1.6" />
          <line x1="21" y1="12" x2="27" y2="12" stroke={dim} strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="24" cy="36" r="1.2" fill={dim} />
        </svg>
      )
    default: // unknown
      return (
        <svg {...common}>
          <rect x="11" y="11" width="26" height="26" rx="3" fill={body} stroke={dim} strokeWidth="1.6" strokeDasharray="3 2.5" />
          <path d="M20 21 q0 -4 4 -4 q4 0 4 4 q0 3 -4 4 v2" fill="none" stroke={line} strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="24" cy="31.5" r="1.3" fill={line} />
        </svg>
      )
  }
}
