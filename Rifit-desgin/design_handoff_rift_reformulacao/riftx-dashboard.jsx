/* ═══════════════════════════════════════════════════════════════════════════
   riftx-dashboard.jsx — Dashboard + Detalhe do Engagement (Execução/Findings)
   ═══════════════════════════════════════════════════════════════════════════ */
const { T, tint, MONO, SANS, Ico, IC, SevBadge, Tag, StatusPill, Card, StatCard,
        Btn, SectionHead, PageHead, Donut, Trend, HBars, StackBar } = window;

/* ─── DATA ────────────────────────────────────────────────────────────────── */
const ENGAGEMENTS = [
  { id:'scanbuilder', name:'Scan Builder - DEV', domain:'teste.grcbuilder.tmp.br', status:'Parado',    findings:0,  date:'20/07/2026' },
  { id:'porttus',     name:'Tenant Porttus',     domain:'porttuscs.onmicrosoft.com', status:'Parado',   findings:4,  date:'17/07/2026' },
  { id:'v3',          name:'v3',                 domain:'trustsis.com',            status:'Parado',    findings:3,  date:'17/07/2026' },
  { id:'trustv2',     name:'Tenant trustsis - V2', domain:'trustsis.com',          status:'Concluído', findings:0,  date:'17/07/2026' },
  { id:'trustv1',     name:'Tenant Trustsis - V1', domain:'trustsis.com',          status:'Concluído', findings:0,  date:'17/07/2026' },
  { id:'akdmiv3',     name:'AKDMI - V3',         domain:'porttus.myakdmi.com',     status:'Parado',    findings:5,  date:'16/07/2026' },
  { id:'akdmiv2',     name:'AKDMI - V2',         domain:'*.myakdmi.com*',          status:'Concluído', findings:0,  date:'16/07/2026' },
  { id:'testebuilder',name:'Teste Builder - DEV',domain:'teste.grcbuilder.tmp.br', status:'Parado',    findings:17, date:'15/07/2026' },
  { id:'growv1',      name:'GROW - V1',          domain:'grow.com.br',             status:'Concluído', findings:2,  date:'14/07/2026' },
  { id:'pipev3',      name:'PIPE - V3',          domain:'pipe.com',                status:'Parado',    findings:8,  date:'13/07/2026' },
];

const SEV_DIST = [
  { key:'critical', label:'Critical', v:4  },
  { key:'high',     label:'High',     v:14 },
  { key:'medium',   label:'Medium',   v:26 },
  { key:'low',      label:'Low',      v:19 },
  { key:'info',     label:'Info',     v:40 },
];

const findColor = n => n>=15 ? T.critical : n>=8 ? T.high : n>=4 ? T.medium : n>=1 ? T.low : T.textDim;

/* ─── DASHBOARD ───────────────────────────────────────────────────────────── */
const TREND = [58,62,55,70,66,78,74,83,79,90,96,103];
const TREND_LABELS = ['','','','abr','','','mai','','','jun','','jul'];

function Dashboard({ onOpenEngagement }) {
  const [filter, setFilter] = useState('all');
  const [donutHover, setDonutHover] = useState(null);
  const total = SEV_DIST.reduce((a,s)=>a+s.v,0);
  const list = filter==='all' ? ENGAGEMENTS : ENGAGEMENTS.filter(e=>e.id===filter);
  const donutData = SEV_DIST.map(s => ({ key:s.key, label:s.label, value:s.v, color:window.SEV[s.key].c }));
  const topEng = [...ENGAGEMENTS].sort((a,b)=>b.findings-a.findings).filter(e=>e.findings>0).slice(0,5);

  return (
    <>
      <PageHead title="Dashboard"
        subtitle="Panorama de risco e engagements da plataforma. O que precisa de ação vem primeiro."
        right={<Btn variant="primary" icon={IC.plus}>Novo Escopo</Btn>}/>

      {/* ── Row 1: risk overview ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1.35fr 1fr', gap:16, marginBottom:16 }}>
        {/* donut risk */}
        <Card pad="1.5rem 1.6rem">
          <SectionHead>Panorama de risco</SectionHead>
          <div style={{ display:'flex', alignItems:'center', gap:36 }}>
            <Donut data={donutData} total={total} caption="findings" activeKey={donutHover} onHover={setDonutHover}/>
            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:11 }}>
              {donutData.map(d => (
                <div key={d.key} onMouseEnter={()=>setDonutHover(d.key)} onMouseLeave={()=>setDonutHover(null)}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'0.35rem 0.5rem', borderRadius:7, cursor:'pointer',
                    background: donutHover===d.key ? tint(d.color,0.08) : 'transparent', transition:'background .15s' }}>
                  <span style={{ width:10, height:10, borderRadius:3, background:d.color, flexShrink:0 }}/>
                  <span style={{ fontSize:13, color:T.textSub, flex:1 }}>{d.label}</span>
                  <span style={{ fontSize:14, fontWeight:700, color:T.text, fontFamily:MONO }}>{d.value}</span>
                  <span style={{ fontSize:11, color:T.textFaint, fontFamily:MONO, width:34, textAlign:'right' }}>{Math.round(d.value/total*100)}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* trend */}
        <Card pad="1.5rem 1.6rem">
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:6 }}>
            <SectionHead>Findings ao longo do tempo</SectionHead>
            <div style={{ display:'flex', alignItems:'center', gap:6, color:T.high, fontSize:12, fontWeight:700, fontFamily:MONO }}>
              <Ico s={13} c={T.high}>{IC.chevR}</Ico>+13% <span style={{ color:T.textFaint, fontWeight:400 }}>30d</span>
            </div>
          </div>
          <div style={{ fontSize:30, fontWeight:700, color:T.text, fontFamily:MONO, lineHeight:1, marginBottom:14 }}>103</div>
          <Trend points={TREND} labels={TREND_LABELS} color={T.purpleL} h={110} projFrom={10}/>
        </Card>
      </div>

      {/* ── Row 2: KPIs ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:28 }}>
        <StatCard icon={IC.target}  value="19"  label="Engagements"      sub="total criados"        color={T.purpleL}/>
        <StatCard icon={IC.shield}  value="4"   label="Críticos"         sub="ação imediata"        color={T.critical}/>
        <StatCard icon={IC.alert}   value="14"  label="Altos"            sub="alta severidade"      color={T.high}/>
        <StatCard icon={IC.bug}     value="103" label="Total de findings" sub="em todos os escopos" color={T.info}/>
      </div>

      {/* ── Row 3: needs action ── */}
      <SectionHead count={topEng.length}>Precisam de ação</SectionHead>
      <Card pad="0.5rem 0" style={{ marginBottom:28 }}>
        {topEng.map((e,i) => {
          const col = findColor(e.findings);
          return (
            <div key={e.id} onClick={()=>onOpenEngagement(e)}
              style={{ display:'flex', alignItems:'center', gap:18, padding:'0.95rem 1.4rem', cursor:'pointer',
                borderBottom: i<topEng.length-1?`1px solid ${T.line}`:'none' }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:col, flexShrink:0, boxShadow:`0 0 8px ${tint(col,0.6)}` }}/>
              <div style={{ width:210, minWidth:0 }}>
                <div style={{ fontSize:14, fontWeight:600, color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.name}</div>
                <div style={{ fontSize:11, color:T.textDim, fontFamily:MONO, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.domain}</div>
              </div>
              <div style={{ flex:1, maxWidth:260 }}><StackBar segs={[{v:Math.min(e.findings,4),c:T.critical},{v:Math.max(0,e.findings-4),c:T.high},{v:2,c:T.medium}]}/></div>
              <StatusPill status={e.status}/>
              <div style={{ width:56, textAlign:'right' }}><span style={{ fontSize:19, fontWeight:700, color:col, fontFamily:MONO }}>{e.findings}</span></div>
              <Ico s={16} c={T.textFaint}>{IC.chevR}</Ico>
            </div>
          );
        })}
      </Card>

      {/* ── Row 4: all engagements ── */}
      <SectionHead count={ENGAGEMENTS.length}>Todos os engagements</SectionHead>
      <div style={{ display:'flex', gap:8, marginBottom:18, overflowX:'auto', paddingBottom:4, scrollbarWidth:'none' }}>
        <Chip active={filter==='all'} onClick={()=>setFilter('all')}>Todos</Chip>
        {ENGAGEMENTS.map(e => (
          <Chip key={e.id} active={filter===e.id} color={findColor(e.findings)} count={e.findings}
            onClick={()=>setFilter(filter===e.id?'all':e.id)}>{e.name}</Chip>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
        {list.map(e => <EngCard key={e.id} e={e} onClick={()=>onOpenEngagement(e)}/>)}
      </div>
    </>
  );
}

function Chip({ children, active, color=T.purpleL, count, onClick }) {
  return (
    <button onClick={onClick} style={{ display:'flex', alignItems:'center', gap:7, padding:'0.4rem 0.9rem',
      borderRadius:99, cursor:'pointer', fontFamily:SANS, fontSize:12, fontWeight: active?600:500, flexShrink:0, whiteSpace:'nowrap',
      background: active ? tint(color,0.12) : T.surface, border:`1px solid ${active ? tint(color,0.34) : T.line}`,
      color: active ? color : T.textDim, transition:'all .12s' }}>
      {count!=null && <span style={{ width:7, height:7, borderRadius:'50%', background: count>0 ? findColor(count) : T.textFaint }}/>}
      {children}
      {count!=null && <span style={{ fontSize:10.5, fontFamily:MONO, fontWeight:700, color: count>0 ? findColor(count) : T.textFaint }}>{count}</span>}
    </button>
  );
}

function EngCard({ e, onClick }) {
  const col = findColor(e.findings);
  const pct = Math.min(100, Math.max(6, e.findings/17*100));
  return (
    <Card pad="1.1rem 1.15rem" hover onClick={onClick} style={{ display:'flex', flexDirection:'column', gap:14, minHeight:158 }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
        <div style={{ minWidth:0, flex:1 }}>
          <div style={{ fontSize:14.5, fontWeight:600, color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.name}</div>
          <div style={{ fontSize:11, color:T.textDim, marginTop:4, fontFamily:MONO, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.domain}</div>
        </div>
        <StatusPill status={e.status}/>
      </div>
      <div style={{ marginTop:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:7 }}>
          <span style={{ fontSize:10.5, color:T.textDim, letterSpacing:'0.08em', textTransform:'uppercase' }}>Findings</span>
          <span style={{ fontSize:20, fontWeight:700, color:col, fontFamily:MONO, lineHeight:1 }}>{e.findings}</span>
        </div>
        <div style={{ height:4, borderRadius:99, background:'rgba(255,255,255,0.05)', overflow:'hidden' }}>
          <div style={{ width:`${e.findings===0?0:pct}%`, height:'100%', background:col, borderRadius:99, boxShadow: e.findings?`0 0 8px ${tint(col,0.5)}`:'none' }}/>
        </div>
      </div>
      <div style={{ display:'flex', gap:7, alignItems:'center' }}>
        <StatusPill status="idle"/>
        <span style={{ fontSize:10.5, color:T.textFaint, fontFamily:MONO }}>{e.date}</span>
      </div>
    </Card>
  );
}

/* ─── ENGAGEMENT DETAIL ───────────────────────────────────────────────────── */
const CONFIRMED = [
  { sev:'high',   title:'Subdomain takeover — CNAME órfão de devazure.grcbuilder.tmp.br aponta para recurso Azure não reivindicado', desc:'Este candidato já constava em memory/targets/grcbuilder-tmp-br (RECON-001, engagement builder-dev-v1).' },
  { sev:'medium', title:'Enumeração não-autenticada de tenants (clientId + domínios) via GET /reset/policy?clientUrl=', desc:'O endpoint GET /reset/policy (chamado pela tela "esqueci minha senha" do SPA) aceita um parâmetro "clientUrl".' },
  { sev:'medium', title:'POST /reset/send processa requisições sem qualquer autenticação e vaza enumeração de usuário por tenant', desc:'O bundle do SPA mostra que a action Redux "apiReset/send" sempre envia "Authorization: Bearer {access_token}".' },
  { sev:'medium', title:'REGRESSÃO CONFIRMADA: oráculo de tenant/SSO sem autenticação em /authenticationPolicy?clientUrl= continua ativo', desc:'Este endpoint já havia sido identificado como CONFIRMADO em um engagement anterior (2026-07-13, ENUM-006).' },
];
const SURFACE_OBS = [
  { txt:'Stack tecnológico identificado: Next.js/Node.js/React atrás de Cloudflare', tag:'INFORMATIVO' },
  { txt:'Cabeçalhos expõem possível hospedagem em Azure App Service (ARR/ASP.NET) por trás do Next.js', tag:'INFORMATIVO' },
  { txt:'Cloudflare atuando como WAF/CDN na frente da origem', tag:'INFORMATIVO' },
  { txt:'Certificado TLS é wildcard do domínio raiz grcbuilder.tmp.br (não apenas do subdomínio em escopo)', tag:'INFORMATIVO' },
  { txt:'Mapa completo de rotas da aplicação (204 rotas) vazado via nomes dos chunks JS do Next.js', tag:'INFORMATIVO' },
  { txt:'Hostname real do backend de API revelado via /env.js — api.grcbuilder.tmp.br (FORA DE ESCOPO)', tag:'INFORMATIVO' },
  { txt:'Endpoint SAML SSO ACS (/signin/acs) identificado e testado contra reflected XSS — não vulnerável', tag:'INFORMATIVO' },
  { txt:'Headers de segurança ausentes (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)', tag:'INFORMATIVO' },
  { txt:'Possível confusão de tenant/redirecionamento não validado via RelayState no SAML ACS', tag:'PROVÁVEL' },
];
const MILESTONES = [
  { icon:IC.server, txt:'Host resolvido — 3 IPs', tool:'dig', t:'09:31' },
  { icon:IC.shield, txt:'WAF detectado: Cloudflare', tool:'wafw00f', t:'09:33' },
  { icon:IC.globe,  txt:'1 host vivo (HTTP)', tool:'httpx', t:'09:34' },
  { icon:IC.layers, txt:'Stack detectada: GRC Builder, Cloudflare', tool:'httpx', t:'09:35' },
  { icon:IC.share,  txt:'13 portas abertas', tool:'nmap', t:'09:36' },
  { icon:IC.finding,txt:'20 URLs/endpoints mapeados', tool:'katana', t:'09:39' },
  { icon:IC.finding,txt:'58 caminhos encontrados (fuzz)', tool:'ffuf', t:'09:42' },
  { icon:IC.server, txt:'Host resolvido — 4 IPs', tool:'dig', t:'10:12' },
];
const PHASES = [
  { icon:IC.target, title:'Recon',           sub:'Mapeamento externo',   state:'done' },
  { icon:IC.search, title:'Enumeração',      sub:'Superfície + assets',  state:'active' },
  { icon:IC.shield, title:'Vulnerabilidades',sub:'Exploit-to-confirm',   state:'pending' },
];
const RUNS = [
  { kind:'CHAT', status:'Parado', label:'parado · incompleto', finds:17, cost:'US$ 19.48', dur:'7m', date:'15/07/2026', phases:['Recon','Enum'] },
  { kind:'CHAT', status:'Concluído', label:'concluído', finds:16, cost:'US$ 17.38', dur:'18m', date:'15/07/2026', phases:['Recon','Enum','Vuln','Exploit','Post','Report'] },
];

function EngagementDetail({ eng, onBack }) {
  const [tab, setTab] = useState('exec');
  const e = eng || ENGAGEMENTS.find(x=>x.id==='testebuilder');
  return (
    <>
      {/* header row */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:20, marginBottom:20 }}>
        <div style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
          <button onClick={onBack} style={{ marginTop:3, width:34, height:34, borderRadius:8, background:T.surface, border:`1px solid ${T.line}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:T.textSub }}><Ico s={16} c="currentColor">{IC.arrowL}</Ico></button>
          <div>
            <h1 style={{ fontSize:22, fontWeight:700, color:T.text }}>{e.name}</h1>
            <div style={{ fontSize:12.5, color:T.textDim, marginTop:5, fontFamily:MONO }}>{e.domain}</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:9, alignItems:'center', flexWrap:'wrap', justifyContent:'flex-end' }}>
          <Selector icon={IC.share}  label="Web / API (externo)"/>
          <Selector icon={IC.layers} label="v2 consolidado (padrão)"/>
          <Selector icon={IC.cpu}    label="Sonnet 5"/>
          <Btn variant="ghost" icon={IC.calendar}>Agendar</Btn>
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:T.green, fontFamily:MONO, padding:'0 6px' }}><Ico s={15} c={T.green}>{IC.wifi}</Ico>conectado</div>
        </div>
      </div>

      {/* tabs */}
      <div style={{ display:'flex', gap:4, borderBottom:`1px solid ${T.line}`, marginBottom:24 }}>
        {[['exec','Execução',IC.terminal],['finds','Findings',IC.shield],['report','Relatório',IC.report]].map(([id,label,ic]) => (
          <button key={id} onClick={()=>setTab(id)} style={{ display:'flex', alignItems:'center', gap:8, padding:'0.7rem 1.1rem',
            background:'none', border:'none', borderBottom:`2px solid ${tab===id?T.purple:'transparent'}`, marginBottom:-1,
            cursor:'pointer', fontFamily:SANS, fontSize:13.5, fontWeight: tab===id?600:500, color: tab===id?T.purpleL:T.textDim, transition:'all .12s' }}>
            <Ico s={15} c={tab===id?T.purpleL:T.textDim}>{ic}</Ico>{label}
          </button>
        ))}
      </div>

      {tab==='exec' && <ExecTab e={e}/>}
      {tab==='finds' && <FindsTab/>}
      {tab==='report' && <ReportStub e={e}/>}
    </>
  );
}

function Selector({ icon, label }) {
  return (
    <button style={{ display:'flex', alignItems:'center', gap:8, padding:'0.5rem 0.85rem', borderRadius:8,
      background:T.surface, border:`1px solid ${T.line}`, cursor:'pointer', fontFamily:SANS, fontSize:12.5, fontWeight:500, color:T.textSub }}>
      <Ico s={14} c={T.purpleL}>{icon}</Ico>{label}<Ico s={13} c={T.textDim} style={{ marginLeft:2 }}>{IC.chevD}</Ico>
    </button>
  );
}

/* ── Execução — pipeline timeline ── */
const PIPELINE = [
  { key:'recon', icon:IC.target, title:'Recon', sub:'Mapeamento externo', state:'done', count:8, tools:'dig · wafw00f · nmap',
    milestones:[
      { icon:IC.server, txt:'Host resolvido — 3 IPs', tool:'dig', t:'09:31' },
      { icon:IC.shield, txt:'WAF detectado: Cloudflare', tool:'wafw00f', t:'09:33' },
      { icon:IC.globe,  txt:'1 host vivo (HTTP)', tool:'httpx', t:'09:34' },
      { icon:IC.share,  txt:'13 portas abertas', tool:'nmap', t:'09:36' },
    ] },
  { key:'enum', icon:IC.search, title:'Enumeração', sub:'Superfície + assets', state:'active', count:5, tools:'katana · ffuf · httpx',
    milestones:[
      { icon:IC.layers, txt:'Stack detectada: GRC Builder, Cloudflare', tool:'httpx', t:'09:35' },
      { icon:IC.finding,txt:'20 URLs/endpoints mapeados', tool:'katana', t:'09:39' },
      { icon:IC.finding,txt:'58 caminhos encontrados (fuzz)', tool:'ffuf', t:'09:42' },
    ] },
  { key:'vuln', icon:IC.shield, title:'Vulnerabilidades', sub:'Exploit-to-confirm', state:'pending', milestones:[] },
  { key:'exploit', icon:IC.bug, title:'Exploração', sub:'Prova de exploração', state:'pending', milestones:[] },
  { key:'report', icon:IC.report, title:'Relatório', sub:'Evidência + remediação', state:'pending', milestones:[] },
];
const PH = { done:{c:T.green,l:'concluído'}, active:{c:T.purpleL,l:'em progresso'}, pending:{c:T.textDim,l:'pendente'} };

function ExecTab({ e }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* summary */}
      <Card pad="1.6rem 1.75rem">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:24, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:10.5, fontWeight:600, color:T.purpleL, letterSpacing:'0.14em', marginBottom:9, fontFamily:MONO }}>MAPEAMENTO EXTERNO · AGENTE 1 · BLACK-BOX</div>
            <div style={{ fontSize:22, fontWeight:700, color:T.text }}>{e.name}</div>
            <div style={{ fontSize:12, color:T.textDim, marginTop:5, fontFamily:MONO }}>{e.domain}</div>
          </div>
          <div style={{ display:'flex', gap:38, alignItems:'center' }}>
            <SummaryStat value="4" label="Achados"/>
            <SummaryStat value="13" label="Superfície"/>
            <SummaryStat value="$19.48" label="Custo" color={T.green}/>
            <SummaryStat value="7:49" label="Duração" color={T.textSub} icon={IC.clock}/>
            <StatusPill status="Parado"/>
          </div>
        </div>
      </Card>

      {/* resume action */}
      <Card pad="1.6rem 1.75rem" accent={T.purple}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:28, flexWrap:'wrap' }}>
          <div style={{ maxWidth:560 }}>
            <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:9 }}>
              <Ico s={18} c={T.green}>{IC.checkCirc}</Ico>
              <span style={{ fontSize:16, fontWeight:600, color:T.text }}>Recon e enumeração concluídos</span>
            </div>
            <p style={{ fontSize:13, color:T.textSub, lineHeight:1.55 }}>O run pausou antes de fechar a fase de Vulnerabilidades. Continue para completá-la, ou gere o relatório com o que já foi confirmado.</p>
          </div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            <Btn variant="primary" icon={IC.play}>Continuar testes</Btn>
            <Btn variant="soft" icon={IC.report}>Gerar relatório</Btn>
            <Btn variant="ghost" icon={IC.refresh}>Começar do zero</Btn>
          </div>
        </div>
      </Card>

      {/* pipeline */}
      <div style={{ marginTop:8 }}>
        <SectionHead right={<Btn variant="ghost" icon={IC.refresh} size="sm">Atualizar</Btn>}>Pipeline de execução</SectionHead>
        <div style={{ position:'relative', paddingLeft:8 }}>
          {PIPELINE.map((p,i) => {
            const m = PH[p.state];
            const last = i===PIPELINE.length-1;
            return (
              <div key={p.key} style={{ display:'flex', gap:20, position:'relative' }}>
                {/* rail + node */}
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0, width:40 }}>
                  <div style={{ width:40, height:40, borderRadius:11, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                    background: p.state==='pending' ? T.surface : tint(m.c,0.12), border:`1px solid ${p.state==='pending'?T.line:tint(m.c,0.4)}`,
                    boxShadow: p.state==='active'?`0 0 14px ${tint(m.c,0.4)}`:'none' }}>
                    {p.state==='done' ? <Ico s={19} c={m.c}>{IC.checkCirc}</Ico> : <Ico s={18} c={m.c}>{p.icon}</Ico>}
                  </div>
                  {!last && <div style={{ width:2, flex:1, minHeight:p.milestones.length?24:32, background: p.state==='done'?tint(T.green,0.35):T.line, margin:'4px 0' }}/>}
                </div>
                {/* content */}
                <div style={{ flex:1, paddingBottom: last?0:26 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12, minHeight:40 }}>
                    <span style={{ fontSize:16, fontWeight:600, color: p.state==='pending'?T.textDim:T.text }}>{p.title}</span>
                    <span style={{ fontSize:9.5, fontWeight:700, color:m.c, letterSpacing:'0.06em', fontFamily:MONO, padding:'2px 8px', borderRadius:99, background:tint(m.c,0.1), border:`1px solid ${tint(m.c,0.28)}` }}>{m.l}</span>
                    {p.count!=null && <span style={{ fontSize:11.5, color:T.textDim, fontFamily:MONO }}>{p.count} marcos</span>}
                    {p.tools && <span style={{ marginLeft:'auto', fontSize:11, color:T.textFaint, fontFamily:MONO }}>{p.tools}</span>}
                  </div>
                  <div style={{ fontSize:12.5, color:T.textDim, marginTop:2 }}>{p.sub}</div>
                  {p.milestones.length>0 && (
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginTop:14 }}>
                      {p.milestones.map((ms,j) => (
                        <div key={j} style={{ display:'flex', alignItems:'center', gap:11, padding:'0.7rem 0.95rem', background:T.surface, border:`1px solid ${T.line}`, borderRadius:9 }}>
                          <Ico s={15} c={T.purpleL}>{ms.icon}</Ico>
                          <span style={{ fontSize:13, color:T.textSub, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ms.txt}</span>
                          <span style={{ fontSize:10.5, color:T.textDim, fontFamily:MONO }}>{ms.tool}</span>
                          <span style={{ fontSize:10.5, color:T.textFaint, fontFamily:MONO }}>{ms.t}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SummaryStat({ value, label, color=T.text, icon }) {
  return (
    <div style={{ textAlign:'center' }}>
      <div style={{ fontSize:22, fontWeight:700, color, fontFamily:MONO, lineHeight:1, display:'flex', alignItems:'center', gap:5, justifyContent:'center' }}>
        {icon && <Ico s={15} c={T.textDim}>{icon}</Ico>}{value}
      </div>
      <div style={{ fontSize:10.5, color:T.textDim, marginTop:6, letterSpacing:'0.06em', textTransform:'uppercase' }}>{label}</div>
    </div>
  );
}

/* ── Findings ── */
function FindsTab() {
  const [showActivity, setShowActivity] = useState(false);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:26 }}>
      {/* confirmed */}
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:6 }}>
          <div style={{ display:'flex', alignItems:'center', gap:9 }}>
            <Ico s={18} c={T.high}>{IC.alert}</Ico>
            <span style={{ fontSize:16, fontWeight:600, color:T.text }}>Achados confirmados</span>
          </div>
          <SevBadge sev="high"/><Tag color={T.medium} filled>3 MEDIUM</Tag>
        </div>
        <p style={{ fontSize:12.5, color:T.textDim, marginBottom:16 }}>Itens com evidência suficiente para serem tratados como findings confirmados (taxonomia <span style={{ fontFamily:MONO, color:T.textSub }}>confirmed</span>).</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:14 }}>
          {CONFIRMED.map((f,i) => {
            const c = window.SEV[f.sev].c;
            return (
              <Card key={i} pad="1.15rem 1.25rem" accent={c} hover style={{ borderColor:tint(c,0.22) }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                  <SevBadge sev={f.sev}/><Ico s={15} c={T.green}>{IC.checkCirc}</Ico>
                </div>
                <div style={{ fontSize:14, fontWeight:600, color:T.text, lineHeight:1.4, marginBottom:8, textWrap:'pretty' }}>{f.title}</div>
                <p style={{ fontSize:12, color:T.textDim, lineHeight:1.5, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{f.desc}</p>
              </Card>
            );
          })}
        </div>
      </div>

      {/* surface map */}
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:6 }}>
          <Ico s={18} c={T.purpleL}>{IC.target}</Ico>
          <span style={{ fontSize:16, fontWeight:600, color:T.text }}>Mapa de superfície</span>
          <span style={{ fontSize:11, color:T.textFaint, fontFamily:MONO }}>13 observações</span>
        </div>
        <p style={{ fontSize:12.5, color:T.textDim, marginBottom:16 }}>Hosts, domínios, portas, serviços, tecnologias, endpoints e exposições observadas. Uma observação de superfície não é, por si só, uma vulnerabilidade.</p>
        <Card pad="0.4rem 0">
          {SURFACE_OBS.map((o,i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'0.8rem 1.25rem', borderBottom: i<SURFACE_OBS.length-1?`1px solid ${T.line}`:'none' }}>
              <span style={{ width:7, height:7, borderRadius:2, background: o.tag==='PROVÁVEL'?T.medium:T.info, flexShrink:0 }}/>
              <span style={{ fontSize:13, color:T.textSub, flex:1, lineHeight:1.4 }}>{o.txt}</span>
              <Tag color={o.tag==='PROVÁVEL'?T.medium:T.info}>{o.tag}</Tag>
            </div>
          ))}
        </Card>
      </div>

      {/* agent activity */}
      <Card pad="0" onClick={()=>setShowActivity(s=>!s)} hover>
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'0.95rem 1.25rem', cursor:'pointer' }}>
          <Ico s={16} c={T.textDim} style={{ transform: showActivity?'rotate(90deg)':'none', transition:'transform .15s' }}>{IC.chevR}</Ico>
          <Ico s={15} c={T.purpleL}>{IC.terminal}</Ico>
          <span style={{ fontSize:13.5, fontWeight:600, color:T.text }}>Atividade do agente</span>
          <span style={{ fontSize:11, color:T.textFaint, fontFamily:MONO }}>(40)</span>
          <span style={{ marginLeft:'auto', fontSize:11, color:T.textFaint, fontFamily:MONO }}>linha do tempo operacional</span>
        </div>
      </Card>

      {/* run history */}
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:14 }}>
          <Ico s={17} c={T.purpleL}>{IC.history}</Ico>
          <span style={{ fontSize:16, fontWeight:600, color:T.text }}>Histórico de runs</span>
          <span style={{ fontSize:11, color:T.textFaint, fontFamily:MONO }}>(3)</span>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {RUNS.map((r,i) => {
            const c = r.status==='Concluído'?T.green:T.orange;
            return (
              <Card key={i} pad="1rem 1.25rem" hover>
                <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
                  <Ico s={14} c={T.textDim}>{IC.chevD}</Ico>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:c }}/>
                  <span style={{ fontSize:12, fontWeight:700, color:T.textSub, fontFamily:MONO }}>{r.kind}</span>
                  <span style={{ fontSize:12.5, color:c, fontWeight:600 }}>{r.label}</span>
                  <div style={{ marginLeft:'auto', display:'flex', gap:20, alignItems:'center', fontFamily:MONO, fontSize:12, color:T.textDim }}>
                    <span><span style={{ color:T.text, fontWeight:700 }}>{r.finds}</span> finds</span>
                    <span>{r.cost}</span><span>{r.dur}</span><span style={{ color:T.textFaint }}>{r.date}</span>
                  </div>
                </div>
                <div style={{ display:'flex', gap:14, marginTop:11, paddingLeft:38, flexWrap:'wrap' }}>
                  {['Recon','Enum','Vuln','Exploit','Post','Report'].map(p => {
                    const on = r.phases.includes(p);
                    return <span key={p} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color: on?T.green:T.textFaint, fontFamily:MONO }}><span style={{ width:6, height:6, borderRadius:'50%', background: on?T.green:T.textFaint }}/>{p}</span>;
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ReportStub({ e }) {
  return (
    <Card pad="3rem" style={{ textAlign:'center' }}>
      <div style={{ width:56, height:56, borderRadius:14, background:T.purpleDim, border:`1px solid ${T.line2}`, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 18px' }}><Ico s={26} c={T.purpleL}>{IC.report}</Ico></div>
      <div style={{ fontSize:17, fontWeight:600, color:T.text, marginBottom:8 }}>Relatório de {e.name}</div>
      <p style={{ fontSize:13, color:T.textSub, maxWidth:420, margin:'0 auto 22px', lineHeight:1.6 }}>Gere um relatório executivo e técnico com os {e.findings} findings confirmados, mapa de superfície e linha do tempo operacional.</p>
      <Btn variant="primary" icon={IC.report} style={{ margin:'0 auto' }}>Gerar relatório</Btn>
    </Card>
  );
}

Object.assign(window, { Dashboard, EngagementDetail, ENGAGEMENTS });
