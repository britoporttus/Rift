/* ═══════════════════════════════════════════════════════════════════════════
   riftx-extra.jsx — Login · Findings · Vazamentos · Relatórios · Usuários · Admin
   ═══════════════════════════════════════════════════════════════════════════ */
const { T, tint, MONO, SANS, Ico, IC, SevBadge, Tag, StatusPill, Card, StatCard,
        Btn, SectionHead, PageHead } = window;

/* ─── LOGIN ───────────────────────────────────────────────────────────────── */
const RADAR_NODES = [
  { label:'WEB-01', ip:'192.168.1.22', x:44, y:30, c:T.green },
  { label:'DB-02',  ip:'192.168.1.45', x:78, y:34, c:T.red },
  { label:'API-03', ip:'192.168.2.8',  x:80, y:64, c:T.green },
  { label:'PROXY',  ip:'192.168.4.2',  x:34, y:52, c:T.medium },
  { label:'FW-01',  ip:'192.168.2.31', x:40, y:76, c:T.medium },
  { label:'VPN-GW', ip:'192.168.3.7',  x:56, y:14, c:T.textDim },
];

function Login({ onAuth }) {
  return (
    <div style={{ height:'100vh', width:'100vw', background:T.bg, color:T.text, fontFamily:SANS, position:'relative', overflow:'hidden', display:'flex' }}>
      {/* top strip */}
      <div style={{ position:'absolute', top:0, left:0, right:0, height:44, display:'flex', alignItems:'center', padding:'0 1.5rem', gap:14, borderBottom:`1px solid ${T.line}`, zIndex:20, fontFamily:MONO, fontSize:11 }}>
        <span style={{ color:T.purpleL, fontWeight:700, letterSpacing:'0.16em' }}>RIFT</span>
        <span style={{ color:T.textFaint }}>|</span>
        <span style={{ color:T.textDim }}>AI Pentest Platform</span>
        <span style={{ color:T.textFaint }}>|</span>
        <span style={{ color:T.textDim }}>v1.0.2</span>
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8, color:T.green }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:T.green, boxShadow:`0 0 8px ${T.green}` }}/>SECURE
        </div>
      </div>

      {/* radar background */}
      <div style={{ position:'absolute', inset:0, ...window.GRID_BG }}/>
      <div style={{ position:'absolute', right:'6%', top:'50%', transform:'translateY(-50%)', width:560, height:560, pointerEvents:'none' }}>
        {[1,0.72,0.46,0.22].map((s,i) => (
          <div key={i} style={{ position:'absolute', inset:0, margin:'auto', width:`${s*100}%`, height:`${s*100}%`, borderRadius:'50%', border:`1px solid ${tint(T.purple, 0.16)}` }}/>
        ))}
        <div style={{ position:'absolute', inset:0, margin:'auto', width:14, height:14, borderRadius:'50%', background:T.purpleL, boxShadow:`0 0 20px ${T.purpleGlow}` }}/>
        <div style={{ position:'absolute', inset:0, borderRadius:'50%', background:`conic-gradient(from 0deg, transparent 0deg, ${tint(T.purple,0.18)} 40deg, transparent 60deg)`, animation:'radarSweep 4s linear infinite' }}/>
        {RADAR_NODES.map((n,i) => (
          <div key={i} style={{ position:'absolute', left:`${n.x}%`, top:`${n.y}%` }}>
            <span style={{ width:7, height:7, borderRadius:'50%', background:n.c, boxShadow:`0 0 8px ${n.c}`, display:'block' }}/>
            <div style={{ position:'absolute', left:12, top:-4, whiteSpace:'nowrap', fontFamily:MONO, fontSize:8.5, color:T.textDim }}>{n.label}<br/><span style={{ color:T.textFaint }}>{n.ip}</span></div>
          </div>
        ))}
      </div>
      <div style={{ position:'absolute', right:'14%', bottom:'12%', fontSize:120, fontWeight:700, color:tint(T.purple,0.05), letterSpacing:'0.1em', pointerEvents:'none', fontFamily:SANS }}>RIFT</div>

      {/* auth card */}
      <div style={{ position:'relative', zIndex:10, display:'flex', alignItems:'center', paddingLeft:'8%' }}>
        <div style={{ width:400, background:tint('#0C0C16',0.92), backdropFilter:'blur(12px)', border:`1px solid ${T.line2}`, borderRadius:16, overflow:'hidden', boxShadow:`0 30px 80px rgba(0,0,0,0.5)` }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0.85rem 1.15rem', borderBottom:`1px solid ${T.line}`, fontFamily:MONO, fontSize:10.5 }}>
            <span style={{ display:'flex', gap:6 }}><span style={{ width:9, height:9, borderRadius:'50%', background:'#3A3A48' }}/><span style={{ width:9, height:9, borderRadius:'50%', background:'#3A3A48' }}/><span style={{ width:9, height:9, borderRadius:'50%', background:'#3A3A48' }}/></span>
            <span style={{ color:T.textDim, marginLeft:6 }}>RIFT-AUTH · TLS 1.3</span>
            <span style={{ marginLeft:'auto', color:T.green, display:'flex', alignItems:'center', gap:5 }}><span style={{ width:5, height:5, borderRadius:'50%', background:T.green }}/>SECURE</span>
          </div>
          <div style={{ padding:'1.75rem' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
              <div style={{ width:32, height:32, borderRadius:8, background:`linear-gradient(140deg,${T.purple},${T.purpleD})`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 14px ${T.purpleGlow}` }}><Ico s={17} c="#fff" sw={2.1}>{IC.target}</Ico></div>
              <span style={{ fontSize:19, fontWeight:700, letterSpacing:'0.02em' }}>Rift</span>
            </div>
            <h1 style={{ fontSize:24, fontWeight:700, marginBottom:6 }}>Bem-vindo de volta</h1>
            <div style={{ fontFamily:MONO, fontSize:11.5, color:T.textDim, marginBottom:22 }}>// autenticação local</div>

            <button style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'0.75rem 1rem', background:T.surface, border:`1px solid ${T.line2}`, borderRadius:9, cursor:'pointer', fontFamily:MONO, fontSize:12.5, color:T.textSub, marginBottom:20 }}>
              <span style={{ color:T.green }}>$</span> auth <span style={{ color:T.purpleL }}>--provider</span> microsoft <span style={{ color:T.purpleL }}>--sso</span>
              <span style={{ marginLeft:'auto', display:'flex', gap:2 }}>{['#F25022','#7FBA00','#00A4EF','#FFB900'].map(c=><span key={c} style={{ width:8, height:8, background:c }}/>)}</span>
            </button>

            <div style={{ display:'flex', alignItems:'center', gap:12, margin:'0 0 18px', color:T.textFaint, fontFamily:MONO, fontSize:10 }}>
              <div style={{ flex:1, height:1, background:T.line }}/>local access<div style={{ flex:1, height:1, background:T.line }}/>
            </div>

            <Field label="IDENT" placeholder="usuário@porttus.com"/>
            <Field label="AUTH-KEY" placeholder="••••••••••••" type="password" eye/>

            <button onClick={onAuth} style={{ width:'100%', marginTop:6, display:'flex', alignItems:'center', justifyContent:'center', gap:9, padding:'0.85rem', background:`linear-gradient(140deg,${T.purple},${T.purpleD})`, border:'none', borderRadius:9, cursor:'pointer', fontFamily:SANS, fontSize:13.5, fontWeight:700, color:'#fff', boxShadow:`0 0 24px ${T.purpleGlow}` }}>
              <Ico s={14} c="#fff" sw={2.5}>{IC.play}</Ico>RUN AUTHENTICATE
            </button>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'0.9rem 1.75rem', borderTop:`1px solid ${T.line}`, fontFamily:MONO }}>
            <Ico s={14} c={T.textDim}>{IC.shield}</Ico>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, color:T.textSub }}>Acesso restrito e monitorado</div>
              <div style={{ fontSize:9, color:T.textFaint }}>Todos os eventos são registrados.</div>
            </div>
            <span style={{ fontSize:9, fontWeight:700, color:T.green, padding:'3px 8px', borderRadius:5, border:`1px solid ${tint(T.green,0.3)}`, background:tint(T.green,0.1), letterSpacing:'0.08em' }}>VERIFICADO</span>
          </div>
        </div>
      </div>

      {/* right status panels */}
      <div style={{ position:'absolute', right:'2.5%', top:70, width:240, display:'flex', flexDirection:'column', gap:14, zIndex:10 }}>
        <div style={{ background:tint('#0C0C16',0.88), backdropFilter:'blur(10px)', border:`1px solid ${T.line}`, borderRadius:12, padding:'1rem 1.15rem' }}>
          <div style={{ fontFamily:MONO, fontSize:9.5, color:T.textDim, letterSpacing:'0.14em', marginBottom:12 }}>SISTEMA OPERACIONAL</div>
          <div style={{ display:'flex', alignItems:'center', gap:8, color:T.green, fontSize:12, fontWeight:600, marginBottom:12 }}><span style={{ width:6, height:6, borderRadius:'50%', background:T.green, boxShadow:`0 0 8px ${T.green}` }}/>ONLINE</div>
          {[['ENGINE','v2.4.1'],['MODULES','CARREGADOS'],['DATABASE','CONECTADO'],['UPTIME','2d 14h 37m']].map(([k,v]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', fontFamily:MONO, fontSize:10.5, borderTop:`1px solid ${T.line}` }}><span style={{ color:T.textFaint }}>{k}</span><span style={{ color:T.textSub, fontWeight:600 }}>{v}</span></div>
          ))}
        </div>
        <div style={{ background:tint('#0C0C16',0.88), backdropFilter:'blur(10px)', border:`1px solid ${T.line}`, borderRadius:12, padding:'1rem 1.15rem', position:'absolute', top:340, width:'100%' }}>
          <div style={{ fontFamily:MONO, fontSize:9.5, color:T.textDim, letterSpacing:'0.14em', marginBottom:10 }}>THREAT LEVEL</div>
          <div style={{ fontSize:26, fontWeight:700, color:T.green, letterSpacing:'0.06em' }}>BAIXO</div>
          <svg viewBox="0 0 200 40" style={{ width:'100%', height:36, marginTop:10 }}><polyline points="0,28 25,22 50,30 75,18 100,26 125,14 150,24 175,16 200,22" fill="none" stroke={T.green} strokeWidth="1.5"/></svg>
          <div style={{ fontFamily:MONO, fontSize:9, color:T.textFaint, marginTop:6 }}>Última verificação: agora</div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, placeholder, type='text', eye }) {
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:8, fontFamily:MONO, fontSize:10.5, color:T.purpleL, letterSpacing:'0.08em' }}><Ico s={11} c={T.purpleL}>{IC.chevR}</Ico>{label}</div>
      <div style={{ display:'flex', alignItems:'center', background:T.surface, border:`1px solid ${T.line2}`, borderRadius:9, padding:'0 0.9rem' }}>
        <input type={type} placeholder={placeholder} style={{ flex:1, background:'none', border:'none', outline:'none', color:T.text, fontSize:13, fontFamily:MONO, padding:'0.7rem 0' }}/>
        {eye && <Ico s={15} c={T.textDim} style={{ cursor:'pointer' }}>{IC.eye}</Ico>}
      </div>
    </div>
  );
}

/* ─── FINDINGS (global) ───────────────────────────────────────────────────── */
const ALL_FINDINGS = [
  { sev:'high',   title:'Subdomain takeover — CNAME órfão aponta para recurso Azure', eng:'Teste Builder - DEV', date:'15/07/2026' },
  { sev:'medium', title:'Enumeração não-autenticada de tenants via GET /reset/policy', eng:'Teste Builder - DEV', date:'15/07/2026' },
  { sev:'critical', title:'RCE via deserialização insegura no endpoint /api/import', eng:'AKDMI - V3', date:'16/07/2026' },
  { sev:'high',   title:'IDOR permite acesso a documentos de outros tenants', eng:'AKDMI - V3', date:'16/07/2026' },
  { sev:'medium', title:'POST /reset/send sem autenticação vaza enumeração de usuário', eng:'Teste Builder - DEV', date:'15/07/2026' },
  { sev:'low',    title:'Headers de segurança ausentes (CSP, HSTS, X-Frame-Options)', eng:'Tenant Porttus', date:'17/07/2026' },
  { sev:'medium', title:'Oráculo de tenant/SSO sem autenticação em /authenticationPolicy', eng:'v3', date:'17/07/2026' },
  { sev:'high',   title:'SQL injection cega no parâmetro de busca /search?q=', eng:'PIPE - V3', date:'13/07/2026' },
  { sev:'info',   title:'Stack tecnológico exposto: Next.js/Node.js/React atrás de Cloudflare', eng:'Teste Builder - DEV', date:'15/07/2026' },
  { sev:'low',    title:'Cookie de sessão sem flag Secure em ambiente de produção', eng:'GROW - V1', date:'14/07/2026' },
];

function Findings() {
  const [sev, setSev] = useState('all');
  const counts = { all:ALL_FINDINGS.length, critical:0, high:0, medium:0, low:0, info:0 };
  ALL_FINDINGS.forEach(f => counts[f.sev]++);
  const list = sev==='all' ? ALL_FINDINGS : ALL_FINDINGS.filter(f=>f.sev===sev);
  return (
    <>
      <PageHead icon={IC.finding} title="Findings" subtitle="Todos os achados confirmados em todos os engagements, ordenados por severidade."/>
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        <FiltPill active={sev==='all'} onClick={()=>setSev('all')} label="Todos" count={counts.all} color={T.purpleL}/>
        {['critical','high','medium','low','info'].map(s => (
          <FiltPill key={s} active={sev===s} onClick={()=>setSev(s)} label={window.SEV[s].label} count={counts[s]} color={window.SEV[s].c}/>
        ))}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {list.map((f,i) => {
          const c = window.SEV[f.sev].c;
          return (
            <Card key={i} pad="1rem 1.25rem" accent={c} hover>
              <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                <div style={{ width:110, flexShrink:0 }}><SevBadge sev={f.sev}/></div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:T.text, lineHeight:1.4, textWrap:'pretty' }}>{f.title}</div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:14, flexShrink:0 }}>
                  <Tag color={T.purpleL} filled>{f.eng}</Tag>
                  <span style={{ fontSize:11, color:T.textFaint, fontFamily:MONO, width:74, textAlign:'right' }}>{f.date}</span>
                  <Ico s={15} c={T.textFaint}>{IC.chevR}</Ico>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
function FiltPill({ active, onClick, label, count, color }) {
  return (
    <button onClick={onClick} style={{ display:'flex', alignItems:'center', gap:8, padding:'0.45rem 0.95rem', borderRadius:99,
      background: active?tint(color,0.12):T.surface, border:`1px solid ${active?tint(color,0.34):T.line}`,
      cursor:'pointer', fontFamily:SANS, fontSize:12.5, fontWeight: active?600:500, color: active?color:T.textDim }}>
      <span style={{ width:8, height:8, borderRadius:'50%', background:color }}/>{label}
      <span style={{ fontSize:11, fontFamily:MONO, fontWeight:700 }}>{count}</span>
    </button>
  );
}

/* ─── VAZAMENTOS ──────────────────────────────────────────────────────────── */
function Vazamentos() {
  return (
    <>
      <PageHead icon={IC.leak} title="Vazamentos" subtitle="Busca por credenciais e dados expostos em fontes públicas e breaches conhecidos."/>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:24 }}>
        <StatCard icon={IC.key}    value="0"  label="Credenciais vazadas" sub="em domínios monitorados" color={T.critical}/>
        <StatCard icon={IC.shield} value="8"  label="Domínios buscados"    sub="fontes reais habilitadas" color={T.purpleL}/>
        <StatCard icon={IC.clock}  value="—"  label="Última busca"         sub="nenhuma executada" color={T.textSub}/>
      </div>
      <Card pad="3.5rem" style={{ textAlign:'center' }}>
        <div style={{ width:56, height:56, borderRadius:14, background:T.purpleDim, border:`1px solid ${T.line2}`, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 18px' }}><Ico s={26} c={T.purpleL}>{IC.leak}</Ico></div>
        <div style={{ fontSize:17, fontWeight:600, color:T.text, marginBottom:8 }}>Nenhuma busca de vazamento executada</div>
        <p style={{ fontSize:13, color:T.textSub, maxWidth:440, margin:'0 auto 22px', lineHeight:1.6 }}>Execute uma busca para verificar credenciais expostas dos seus domínios autorizados em breaches conhecidos.</p>
        <Btn variant="primary" icon={IC.search} style={{ margin:'0 auto' }}>Iniciar busca</Btn>
      </Card>
    </>
  );
}

/* ─── RELATÓRIOS ──────────────────────────────────────────────────────────── */
const REPORTS = [
  { name:'AKDMI - V3 — Relatório executivo', eng:'AKDMI - V3', findings:5, date:'16/07/2026', status:'Concluído' },
  { name:'Tenant Porttus — Pentest completo', eng:'Tenant Porttus', findings:4, date:'17/07/2026', status:'Concluído' },
  { name:'v3 — Relatório técnico', eng:'v3', findings:3, date:'17/07/2026', status:'Concluído' },
  { name:'PIPE - V3 — Draft', eng:'PIPE - V3', findings:8, date:'13/07/2026', status:'Rodando' },
];
function Relatorios() {
  return (
    <>
      <PageHead icon={IC.report} title="Relatórios" subtitle="Relatórios executivos e técnicos gerados a partir dos engagements."/>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {REPORTS.map((r,i) => (
          <Card key={i} pad="1.1rem 1.35rem" hover>
            <div style={{ display:'flex', alignItems:'center', gap:16 }}>
              <div style={{ width:40, height:40, borderRadius:9, background:T.purpleDim, border:`1px solid ${T.line2}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Ico s={18} c={T.purpleL}>{IC.report}</Ico></div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14.5, fontWeight:600, color:T.text }}>{r.name}</div>
                <div style={{ fontSize:11.5, color:T.textDim, marginTop:3, fontFamily:MONO }}>{r.eng} · {r.findings} findings</div>
              </div>
              <StatusPill status={r.status}/>
              <span style={{ fontSize:11, color:T.textFaint, fontFamily:MONO }}>{r.date}</span>
              <Btn variant="ghost" size="sm" icon={IC.eye}>Abrir</Btn>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

/* ─── USUÁRIOS ────────────────────────────────────────────────────────────── */
const USERS = [
  { name:'João Brito', email:'joao@porttus.com', role:'Admin', roleC:T.purpleL, last:'agora', init:'JB' },
  { name:'Marina Alves', email:'marina@porttus.com', role:'Pentester', roleC:T.info, last:'2h atrás', init:'MA' },
  { name:'Carlos Souza', email:'carlos@porttus.com', role:'Pentester', roleC:T.info, last:'ontem', init:'CS' },
  { name:'Ana Ferreira', email:'ana@porttus.com', role:'Analista', roleC:T.green, last:'3d atrás', init:'AF' },
  { name:'Rafael Lima', email:'rafael@porttus.com', role:'Viewer', roleC:T.textSub, last:'1sem atrás', init:'RL' },
];
function Usuarios() {
  return (
    <>
      <PageHead icon={IC.users} title="Usuários" subtitle="Membros da organização e seus níveis de acesso na plataforma."
        right={<Btn variant="primary" icon={IC.plus}>Convidar usuário</Btn>}/>
      <Card pad="0">
        <div style={{ display:'grid', gridTemplateColumns:'2.2fr 1fr 1fr 40px', gap:16, padding:'0.85rem 1.35rem', borderBottom:`1px solid ${T.line}`, fontSize:10.5, fontWeight:700, color:T.textDim, letterSpacing:'0.1em', textTransform:'uppercase' }}>
          <span>Usuário</span><span>Papel</span><span>Último acesso</span><span></span>
        </div>
        {USERS.map((u,i) => (
          <div key={i} style={{ display:'grid', gridTemplateColumns:'2.2fr 1fr 1fr 40px', gap:16, padding:'0.95rem 1.35rem', alignItems:'center', borderBottom: i<USERS.length-1?`1px solid ${T.line}`:'none' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background:tint(u.roleC,0.14), border:`1px solid ${tint(u.roleC,0.3)}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:u.roleC, fontFamily:MONO, flexShrink:0 }}>{u.init}</div>
              <div><div style={{ fontSize:13.5, fontWeight:600, color:T.text }}>{u.name}</div><div style={{ fontSize:11.5, color:T.textDim, fontFamily:MONO }}>{u.email}</div></div>
            </div>
            <div><Tag color={u.roleC} filled>{u.role}</Tag></div>
            <span style={{ fontSize:12, color:T.textSub, fontFamily:MONO }}>{u.last}</span>
            <button style={{ background:'none', border:'none', cursor:'pointer', color:T.textDim }}><Ico s={16} c="currentColor">{IC.chevR}</Ico></button>
          </div>
        ))}
      </Card>
    </>
  );
}

/* ─── ADMIN ───────────────────────────────────────────────────────────────── */
function Admin() {
  const groups = [
    { title:'Agentes de IA', icon:IC.cpu, items:['Modelo padrão: Sonnet 5','Perfil de execução: v2 consolidado','Limite de custo por run: US$ 25'] },
    { title:'Escopo & permissões', icon:IC.shield, items:['Domínios autorizados: 8','Probe ativo: habilitado','Fontes de vazamento: reais'] },
    { title:'Integrações', icon:IC.layers, items:['Microsoft SSO: conectado','Webhook de alertas: configurado','Exportação de relatórios: PDF'] },
  ];
  return (
    <>
      <PageHead icon={IC.admin} title="Admin" subtitle="Configurações da plataforma, agentes e integrações."/>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
        {groups.map((g,i) => (
          <Card key={i} pad="1.35rem">
            <div style={{ display:'flex', alignItems:'center', gap:11, marginBottom:16 }}>
              <div style={{ width:36, height:36, borderRadius:9, background:T.purpleDim, border:`1px solid ${T.line2}`, display:'flex', alignItems:'center', justifyContent:'center' }}><Ico s={17} c={T.purpleL}>{g.icon}</Ico></div>
              <span style={{ fontSize:15, fontWeight:600, color:T.text }}>{g.title}</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
              {g.items.map((it,j) => (
                <div key={j} style={{ display:'flex', alignItems:'center', gap:9, fontSize:12.5, color:T.textSub }}><span style={{ width:5, height:5, borderRadius:'50%', background:T.purpleL, flexShrink:0 }}/>{it}</div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

Object.assign(window, { Login, Findings, Vazamentos, Relatorios, Usuarios, Admin });
