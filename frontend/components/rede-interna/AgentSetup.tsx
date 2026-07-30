'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Terminal, Copy, Check, RefreshCw, Loader2 } from 'lucide-react'

type Platform = 'linux' | 'windows'

// Painel de setup do agente: mostra o comando (com token) pra rodar numa máquina
// da rede. Duas plataformas — Linux/macOS (Python/nmap) e Windows (PowerShell
// nativo, sem dependência). Só admin (o token é segredo — o backend só entrega
// via /agent-command).
export function AgentSetup({ networkId, authorized, onRegenerated }: {
  networkId: string
  authorized: boolean
  onRegenerated?: () => void
}) {
  const [cmd, setCmd] = useState<{ command: string; commandWindows: string; watchHint: string } | null>(null)
  const [platform, setPlatform] = useState<Platform>('windows')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    api.internalNetworks.agentCommand(networkId)
      .then((c) => setCmd(c))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Erro'))
      .finally(() => setLoading(false))
  }, [networkId])

  const current = cmd ? (platform === 'windows' ? cmd.commandWindows : cmd.command) : ''

  async function copy() {
    if (!current) return
    try { await navigator.clipboard.writeText(current); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch {}
  }

  async function regenerate() {
    if (!confirm('Gerar um token novo? O comando/agente antigo deixa de funcionar.')) return
    setRegenerating(true)
    try {
      await api.internalNetworks.regenerateToken(networkId)
      const c = await api.internalNetworks.agentCommand(networkId)
      setCmd(c); onRegenerated?.()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Erro') }
    finally { setRegenerating(false) }
  }

  const hint = platform === 'windows'
    ? <>Rode no <b>PowerShell como Administrador</b> numa máquina Windows <b>dentro da rede</b>. Não precisa instalar nada (usa o PowerShell nativo; se houver <span style={{ fontFamily: 'var(--mono)' }}>nmap</span>, enriquece o resultado). Para monitoramento contínuo, acrescente <span style={{ fontFamily: 'var(--mono)' }}>-Watch 900</span> ao final.</>
    : <>Rode numa máquina Linux/macOS <b>dentro da rede</b> (precisa de <span style={{ fontFamily: 'var(--mono)' }}>nmap</span> e root para inventário completo). Para monitoramento contínuo, acrescente <span style={{ fontFamily: 'var(--mono)' }}>--watch 900</span> ao final.</>

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-mid)', borderRadius: 12, padding: '1.2rem 1.35rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12, flexWrap: 'wrap' }}>
        <Terminal size={16} color="var(--purple-light)" />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', flex: 1 }}>Rodar o agente nesta rede</span>
        <div style={{ display: 'flex', background: 'var(--bg)', border: '1px solid var(--border-mid)', borderRadius: 8, padding: 2 }}>
          {(['windows', 'linux'] as const).map((p) => (
            <button key={p} onClick={() => setPlatform(p)} style={{
              fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: platform === p ? 'var(--purple)' : 'transparent',
              color: platform === p ? '#fff' : 'var(--muted)',
            }}>{p === 'windows' ? 'Windows' : 'Linux / macOS'}</button>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 12 }}>{hint}</div>

      {!authorized && (
        <div style={{ fontSize: 12, color: 'var(--medium)', background: 'color-mix(in srgb, var(--medium) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--medium) 25%, transparent)', borderRadius: 8, padding: '8px 11px', marginBottom: 12 }}>
          Autorize esta rede primeiro — o agente só é aceito em rede autorizada.
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-mute)', fontSize: 12 }}>carregando comando…</div>
      ) : err ? (
        <div style={{ color: 'var(--critical)', fontSize: 12 }}>{err}</div>
      ) : cmd ? (
        <>
          <div style={{ position: 'relative', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '11px 44px 11px 13px', fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--purple-light)', lineHeight: 1.6, wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
            {current}
            <button onClick={copy} title="Copiar" style={{ position: 'absolute', top: 8, right: 8, background: 'var(--raised)', border: '1px solid var(--border-mid)', borderRadius: 6, color: copied ? 'var(--low)' : 'var(--muted)', cursor: 'pointer', padding: 6, display: 'flex' }}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
          <button onClick={regenerate} disabled={regenerating} style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-mute)', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
            {regenerating ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />} Gerar novo token
          </button>
        </>
      ) : null}
    </div>
  )
}
