// P3-45 (auditoria 2026-07-20): wrapper de <svg> duplicado byte-a-byte em 5
// arquivos (findings, reports, admin, admin/users, Sidebar). Fonte única aqui.
export function SI({ s = 15, c = 'currentColor', sw = 1.75, children }: { s?: number; c?: string; sw?: number; children: React.ReactNode }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c}
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, display: 'block' }}>
      {children}
    </svg>
  )
}
