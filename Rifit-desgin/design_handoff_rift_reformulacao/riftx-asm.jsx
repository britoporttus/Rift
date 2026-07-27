/* ═══════════════════════════════════════════════════════════════════════════
   riftx-asm.jsx — Domínios (lista + detalhe) · Mapa de Superfície
   ═══════════════════════════════════════════════════════════════════════════ */
const { T, tint, MONO, SANS, Ico, IC, SevBadge, Tag, StatusPill, Card, StatCard,
        Btn, SectionHead, PageHead, Gauge, HBars, ScoreSlider, Trend } = window;

/* ─── DATA ────────────────────────────────────────────────────────────────── */
const DOMAINS = [
  { id:'anchieta',  name:'anchieta.br',        kind:'Parceiro',   score:45, assets:95, live:60, exp:0, date:'21/07/2026' },
  { id:'fatecjd',   name:'fatecjd.edu.br',     kind:'Fornecedor', score:15, assets:22, live:11, exp:0, date:'21/07/2026' },
  { id:'trustsis',  name:'trustsis.com',       kind:'Interno',    score:10, assets:10, live:9,  exp:0, date:'21/07/2026' },
  { id:'grcbuilder',name:'grcbuilder.tmp.br',  kind:'Interno',    score:3,  assets:4,  live:4,  exp:0, date:'17/07/2026' },
  { id:'myakdmi',   name:'myakdmi.com',        kind:'Interno',    score:2,  assets:1,  live:1,  exp:0, date:'17/07/2026' },
  { id:'grcbuildercom',name:'grcbuilder.com',  kind:'Fornecedor', score:4,  assets:6,  live:6,  exp:0, date:'16/07/2026' },
  { id:'nubank',    name:'nubank.com',         kind:'Fornecedor', score:5,  assets:8,  live:6,  exp:0, date:'16/07/2026' },
  { id:'porttus',   name:'porttus.com',        kind:'Fornecedor', score:4,  assets:6,  live:5,  exp:0, date:'15/07/2026' },
];
const scoreColor = s => s>=40 ? T.high : s>=15 ? T.medium : s>=5 ? T.low : T.green;
const scoreLabel = s => s>=40 ? 'MEDIUM' : s>=15 ? 'LOW' : 'BAIXO';
const kindColor  = k => k==='Parceiro' ? T.info : k==='Fornecedor' ? T.purpleL : T.textSub;

/* ─── DOMÍNIOS LIST ───────────────────────────────────────────────────────── */
function Dominios({ onOpenDomain }) {
  return (
    <>
      <PageHead icon={IC.globe} title="Domínios"
        subtitle="Análise de superfície (ASM) passiva e score de segurança por domínio — fornecedores, parceiros e ativos próprios."/>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:20 }}>
        <StatCard icon={IC.globe}  value="8" label="Domínios"            sub="monitorados"        color={T.purpleL}/>
        <StatCard icon={IC.alert}  value="0" label="Em risco alto/crítico" sub="requer atenção"   color={T.high}/>
        <StatCard icon={IC.key}    value="0" label="Credenciais vazadas"  sub="em vazamentos"     color={T.critical}/>
      </div>

      {/* add bar */}
      <div style={{ display:'flex', gap:12, marginBottom:22 }}>
        <div style={{ flex:1, display:'flex', alignItems:'center', gap:11, padding:'0 1rem', background:T.surface, border:`1px solid ${T.line}`, borderRadius:9, height:46 }}>
          <Ico s={16} c={T.textDim}>{IC.globe}</Ico>
          <input placeholder="fornecedor.com" style={{ flex:1, background:'none', border:'none', outline:'none', color:T.text, fontSize:13.5, fontFamily:MONO }}/>
        </div>
        <button style={{ display:'flex', alignItems:'center', gap:8, padding:'0 1rem', height:46, background:T.surface, border:`1px solid ${T.line}`, borderRadius:9, cursor:'pointer', color:T.textSub, fontFamily:SANS, fontSize:13 }}>Fornecedor<Ico s={13} c={T.textDim}>{IC.chevD}</Ico></button>
        <Btn variant="primary" icon={IC.plus} style={{ height:46, padding:'0 1.3rem' }}>Adicionar</Btn>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
        {DOMAINS.map(d => <DomainCard key={d.id} d={d} onClick={()=>onOpenDomain(d)}/>)}
      </div>
    </>
  );
}

function DomainCard({ d, onClick }) {
  const sc = scoreColor(d.score);
  return (
    <Card pad="1.25rem 1.35rem" hover onClick={onClick} style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
        <div style={{ minWidth:0 }}>
          <div style={{ fontSize:16, fontWeight:600, color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.name}</div>
          <div style={{ fontSize:11.5, color:T.textDim, marginTop:4, fontFamily:MONO }}>{d.name}</div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <div style={{ fontSize:30, fontWeight:700, color:sc, fontFamily:MONO, lineHeight:1 }}>{d.score}</div>
          <div style={{ fontSize:9, color:T.textDim, letterSpacing:'0.14em', marginTop:3 }}>SEGURANÇA</div>
        </div>
      </div>
      <div style={{ display:'flex', gap:7 }}>
        <Tag color={kindColor(d.kind)} filled>{d.kind}</Tag>
        <StatusPill status="autorizado"/>
      </div>
      <div style={{ display:'flex', gap:26 }}>
        <MiniStat icon={IC.server} value={d.assets} label="ATIVOS"/>
        <MiniStat icon={IC.globe}  value={d.live}   label="VIVOS" color={T.green}/>
        <MiniStat icon={IC.alert}  value={d.exp}    label="EXPOSIÇÕES" color={d.exp>0?T.high:T.textSub}/>
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:2 }}>
        <span style={{ fontSize:11, color:T.textFaint, fontFamily:MONO }}>último: {d.date}</span>
        <Btn variant="soft" icon={IC.scan} size="sm">Escanear</Btn>
      </div>
    </Card>
  );
}
function MiniStat({ icon, value, label, color=T.text }) {
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <Ico s={14} c={T.textDim}>{icon}</Ico>
        <span style={{ fontSize:17, fontWeight:700, color, fontFamily:MONO, lineHeight:1 }}>{value}</span>
      </div>
      <div style={{ fontSize:9, color:T.textDim, letterSpacing:'0.1em', marginTop:5 }}>{label}</div>
    </div>
  );
}

/* ─── DOMÍNIO DETALHE ─────────────────────────────────────────────────────── */
const SCORE_CATS = [
  { label:'Painéis administrativos/login expostos', value:30, color:T.medium },
  { label:'Hosts web vivos na superfície', value:15, color:T.info },
  { label:'Headers de segurança ausentes', value:0, color:T.low },
  { label:'Credenciais vazadas', value:0, color:T.critical },
];
const SURFACE = [
  { url:'https://agentes.anchieta.br', ip:'76.13.120.25', tech:['uvicorn','Python','Uvicorn'], code:200 },
  { url:'https://anchieta.br', title:'Centro Universitário UniAnchieta - 2026', ip:'85.31.228.170', tech:['LiteSpeed','Elementor:4.1.4','Google Tag Manager','HTTP/3','Hostinger'], code:200 },
  { url:'https://api.anchieta.br', title:'Página padrão', ip:'177.105.98.13', tech:['nginx'], code:200 },
  { url:'https://vpn.anchieta.br', ip:'187.32.95.8', tech:['Fortinet'], code:200 },
  { url:'https://docentes.anchieta.br', title:'Portal Docente', ip:'179.190.29.72', tech:['PHP:8.1.34','WordPress:7.0.2'], code:200 },
  { url:'https://ead.anchieta.br', title:'Ambiente EAD', ip:'54.207.84.2', tech:['Moodle','MySQL'], code:200 },
];

function DominioDetalhe({ domain, onBack, onMap }) {
  const d = domain || DOMAINS[0];
  const sc = scoreColor(d.score);
  const [onlyLive, setOnlyLive] = useState(false);
  return (
    <>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:20, marginBottom:22 }}>
        <div style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
          <button onClick={onBack} style={{ marginTop:2, width:34, height:34, borderRadius:8, background:T.surface, border:`1px solid ${T.line}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:T.textSub }}><Ico s={16} c="currentColor">{IC.arrowL}</Ico></button>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <Ico s={22} c={T.purpleL}>{IC.globe}</Ico>
              <h1 style={{ fontSize:24, fontWeight:700, color:T.text }}>{d.name}</h1>
            </div>
            <div style={{ fontSize:12.5, color:T.textDim, marginTop:6, fontFamily:MONO }}>{d.name} · {d.kind}</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <Btn variant="ghost" icon={IC.share} onClick={onMap}>Ver no mapa</Btn>
          <Btn variant="primary" icon={IC.scan}>Escanear</Btn>
          <button style={{ width:38, height:38, borderRadius:8, background:tint(T.red,0.08), border:`1px solid ${tint(T.red,0.25)}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:T.red }}><Ico s={16} c="currentColor">{IC.trash}</Ico></button>
        </div>
      </div>

      {/* score slider + breakdown */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        <Card pad="1.5rem 1.6rem">
          <div style={{ fontSize:11.5, fontWeight:700, color:T.textDim, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:18 }}>Score de segurança</div>
          <ScoreSlider value={d.score} max={100} label={scoreLabel(d.score)} color={sc}/>
          <div style={{ display:'flex', gap:28, marginTop:24, paddingTop:18, borderTop:`1px solid ${T.line}` }}>
            <div><div style={{ fontSize:20, fontWeight:700, color:T.text, fontFamily:MONO }}>{d.assets}</div><div style={{ fontSize:10, color:T.textDim, marginTop:4, letterSpacing:'0.08em' }}>ATIVOS</div></div>
            <div><div style={{ fontSize:20, fontWeight:700, color:T.green, fontFamily:MONO }}>{d.live}</div><div style={{ fontSize:10, color:T.textDim, marginTop:4, letterSpacing:'0.08em' }}>VIVOS</div></div>
            <div><div style={{ fontSize:20, fontWeight:700, color:d.exp>0?T.high:T.textSub, fontFamily:MONO }}>{d.exp}</div><div style={{ fontSize:10, color:T.textDim, marginTop:4, letterSpacing:'0.08em' }}>EXPOSIÇÕES</div></div>
          </div>
        </Card>
        <Card pad="1.5rem 1.6rem">
          <div style={{ fontSize:11.5, fontWeight:700, color:T.textDim, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:20 }}>Composição do score</div>
          <HBars data={SCORE_CATS} max={35} unit=" pts"/>
        </Card>
      </div>

      {/* authorized + credential */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:26 }}>
        <Card pad="1.1rem 1.35rem" accent={T.green} style={{ borderColor:tint(T.green,0.24) }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <Ico s={22} c={T.green}>{IC.shieldCheck}</Ico>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:600, color:T.green }}>Domínio autorizado</div>
              <div style={{ fontSize:11.5, color:T.textSub, marginTop:3 }}>Probe ativo (httpx/nuclei) habilitado · por João Brito.</div>
            </div>
            <Btn variant="ghost" size="sm">Revogar</Btn>
          </div>
        </Card>
        <Card pad="1.1rem 1.35rem" hover>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <Ico s={20} c={T.textDim}>{IC.key}</Ico>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:600, color:T.text }}>Exposição de credenciais</div>
              <div style={{ fontSize:11.5, color:T.textDim, marginTop:3 }}>Nenhuma busca ainda. Abrir no módulo Vazamentos.</div>
            </div>
            <Ico s={16} c={T.textDim}>{IC.chevR}</Ico>
          </div>
        </Card>
      </div>

      {/* surface table */}
      <SectionHead count={95} right={
        <label style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer', fontSize:12, color:T.textSub }}>
          <span onClick={()=>setOnlyLive(v=>!v)} style={{ width:16, height:16, borderRadius:4, border:`1px solid ${onlyLive?T.purple:T.line2}`, background: onlyLive?T.purple:'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>{onlyLive && <Ico s={11} c="#fff" sw={3}>{IC.check}</Ico>}</span>só vivos
        </label>}>Superfície</SectionHead>
      <Card pad="0">
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1.1fr 2fr 70px', gap:16, padding:'0.8rem 1.35rem', borderBottom:`1px solid ${T.line}`, fontSize:10.5, fontWeight:700, color:T.textDim, letterSpacing:'0.1em', textTransform:'uppercase' }}>
          <span>Host</span><span>IP</span><span>Stack</span><span style={{ textAlign:'right' }}>Status</span>
        </div>
        {SURFACE.map((s,i) => (
          <div key={i} style={{ display:'grid', gridTemplateColumns:'2fr 1.1fr 2fr 70px', gap:16, padding:'0.95rem 1.35rem', alignItems:'center', borderBottom: i<SURFACE.length-1?`1px solid ${T.line}`:'none' }}>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:13, color:T.text, fontFamily:MONO, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.url.replace('https://','')}</div>
              {s.title && <div style={{ fontSize:11, color:T.textDim, marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.title}</div>}
            </div>
            <span style={{ fontSize:12, color:T.textSub, fontFamily:MONO }}>{s.ip}</span>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>{s.tech.slice(0,3).map((t,j)=><Tag key={j}>{t}</Tag>)}{s.tech.length>3 && <Tag>+{s.tech.length-3}</Tag>}</div>
            <div style={{ display:'flex', alignItems:'center', gap:7, justifyContent:'flex-end' }}>
              <span style={{ fontSize:13, fontWeight:700, color:T.green, fontFamily:MONO }}>{s.code}</span>
              <span style={{ width:8, height:8, borderRadius:'50%', background:T.green, boxShadow:`0 0 6px ${T.green}` }}/>
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}

/* ─── MAPA DE SUPERFÍCIE ──────────────────────────────────────────────────── */
/* deterministic scatter graph */
function buildNodes() {
  const cx=500, cy=340;
  const rand = (seed) => { const x=Math.sin(seed)*10000; return x-Math.floor(x); };
  const nodes = [{ id:'root', label:'anchieta.br', x:cx, y:cy, r:26, kind:'root' }];
  const subs = ['docentes','www.docentes','ead','vpn','api','agentes','matricula','biblioteca','portal','ns1','ns2','rdsg','teste','staging','esc','uni','n8n','app','revistas','wifi','www2','www3','hospital','medicina','crmapi','colegio','eventos','www.site','ava','emfoco','teleduc','www.web','fatepa','www.get','prompt','hackathon','semanatech','pos','cursoslivres','ng'];
  const ips = ['76.13.120.25','85.31.228.170','177.105.98.13','187.32.95.8','179.190.29.72','54.207.84.2','52.72.49.79','179.125.71.142','54.221.1.74','3.232.36.155','54.94.182.228','200.232.17.246','23.9.0.0','187.32.95.15','52.97.19.146'];
  const tech = ['Next.js','React','Node.js','PHP:8.1.34','WordPress','LiteSpeed','MySQL','jQuery:3.6.0','Cloudflare','HTTP/3','Elementor','reCAPTCHA'];
  const place = (arr, kind, r, ringMin, ringMax, seedBase) => arr.forEach((label,i) => {
    const a = rand(seedBase+i)*Math.PI*2;
    const rad = ringMin + rand(seedBase+i+99)*(ringMax-ringMin);
    nodes.push({ id:kind+i, label, kind, r, x: cx+Math.cos(a)*rad, y: cy+Math.sin(a)*rad*0.62 });
  });
  place(subs, 'sub', 9, 90, 430, 1);
  place(ips,  'ip',  11, 150, 440, 200);
  place(tech, 'tech',13, 120, 400, 400);
  return nodes;
}
const NODE_COLOR = { root:T.purpleL, sub:T.purple, ip:T.info, tech:'#8B90A8' };
const MAP_TABS = [
  { id:'dom', label:'Domínios', n:1, c:T.purpleL },
  { id:'sub', label:'Subdomínios', n:95, c:T.purple },
  { id:'ip',  label:'IPs', n:52, c:T.info },
  { id:'tech',label:'Tecnologias', n:62, c:T.textSub },
  { id:'srv', label:'Servidores', n:8, c:T.textSub },
];

function Mapa() {
  const nodes = useRef(buildNodes()).current;
  const [hover, setHover] = useState(null);
  const [active, setActive] = useState('sub');
  const [sel, setSel] = useState(null);
  const kindMeta = { root:{l:'Domínio raiz',c:T.purpleL}, sub:{l:'Subdomínio',c:T.purple}, ip:{l:'Endereço IP',c:T.info}, tech:{l:'Tecnologia',c:'#8B90A8'} };
  return (
    <>
      <PageHead icon={IC.share} title="Mapa de Superfície"
        subtitle="Ativos, IPs, tecnologias, exposições, vulns e vazamentos deste domínio, interligados."
        right={<>
          <button style={{ display:'flex', alignItems:'center', gap:9, padding:'0.55rem 1rem', background:T.surface, border:`1px solid ${T.line}`, borderRadius:8, cursor:'pointer', color:T.text, fontFamily:SANS, fontSize:13 }}><Ico s={15} c={T.purpleL}>{IC.globe}</Ico>anchieta.br<Ico s={13} c={T.textDim}>{IC.chevD}</Ico></button>
          <button style={{ width:38, height:38, borderRadius:8, background:T.surface, border:`1px solid ${T.line}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:T.textSub }}><Ico s={15} c="currentColor">{IC.refresh}</Ico></button>
        </>}/>

      {/* filter tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
        {MAP_TABS.map(t => (
          <button key={t.id} onClick={()=>setActive(t.id)} style={{ display:'flex', alignItems:'center', gap:8, padding:'0.45rem 0.95rem', borderRadius:99,
            background: active===t.id?tint(t.c,0.12):T.surface, border:`1px solid ${active===t.id?tint(t.c,0.34):T.line}`,
            cursor:'pointer', fontFamily:SANS, fontSize:12.5, fontWeight: active===t.id?600:500, color: active===t.id?t.c:T.textDim }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:t.c }}/>{t.label}
            <span style={{ fontSize:11, fontFamily:MONO, fontWeight:700 }}>{t.n}</span>
          </button>
        ))}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:9, padding:'0 0.9rem', background:T.surface, border:`1px solid ${T.line}`, borderRadius:8 }}>
          <Ico s={14} c={T.textDim}>{IC.search}</Ico>
          <input placeholder="buscar nó…" style={{ width:150, background:'none', border:'none', outline:'none', color:T.text, fontSize:12.5, fontFamily:MONO, padding:'0.5rem 0' }}/>
        </div>
      </div>

      {/* graph + detail */}
      <div style={{ display:'flex', gap:16 }}>
      <Card pad="0" style={{ flex:1, height:600, overflow:'hidden', position:'relative', background:'radial-gradient(ellipse at 50% 45%, rgba(124,58,237,0.06), transparent 70%), #0B0B13' }}>
        <svg viewBox="0 0 1000 680" style={{ width:'100%', height:'100%', display:'block' }}>
          {/* links */}
          {nodes.slice(1).map((n,i) => (
            <line key={'l'+i} x1={500} y1={340} x2={n.x} y2={n.y}
              stroke={tint(NODE_COLOR[n.kind], (hover===n.id||sel?.id===n.id)?0.55:0.14)} strokeWidth={(hover===n.id||sel?.id===n.id)?1.4:0.7}/>
          ))}
          {/* nodes */}
          {nodes.map(n => {
            const c = NODE_COLOR[n.kind];
            const isH = hover===n.id || sel?.id===n.id;
            const dim = active!=='dom' && n.kind!=='root' && ({sub:'sub',ip:'ip',tech:'tech',srv:'tech',dom:'root'}[active] !== n.kind);
            return (
              <g key={n.id} onMouseEnter={()=>setHover(n.id)} onMouseLeave={()=>setHover(null)} onClick={()=>setSel(n)} style={{ cursor:'pointer', opacity: dim?0.22:1, transition:'opacity .2s' }}>
                <circle cx={n.x} cy={n.y} r={isH?n.r+3:n.r} fill={tint(c, n.kind==='root'?0.9:0.72)} stroke={sel?.id===n.id?'#fff':(isH?c:tint(c,0.4))} strokeWidth={sel?.id===n.id?2.5:(isH?2:1)}
                  style={{ filter: n.kind==='root'||isH ? `drop-shadow(0 0 8px ${tint(c,0.7)})` : 'none' }}/>
                {(n.kind==='root' || n.r>=11 || isH) && (
                  <text x={n.x} y={n.y+n.r+13} textAnchor="middle" fill={isH?T.text:T.textDim} fontSize={n.kind==='root'?13:10.5} fontFamily={MONO} fontWeight={n.kind==='root'?700:400}>{n.label}</text>
                )}
              </g>
            );
          })}
        </svg>
        {/* legend */}
        <div style={{ position:'absolute', bottom:16, left:16, display:'flex', gap:16, padding:'0.6rem 1rem', background:tint('#000',0.5), backdropFilter:'blur(8px)', border:`1px solid ${T.line}`, borderRadius:9 }}>
          {[['root','Domínio',T.purpleL],['sub','Subdomínio',T.purple],['ip','IP',T.info],['tech','Tecnologia','#8B90A8']].map(([k,l,c]) => (
            <div key={k} style={{ display:'flex', alignItems:'center', gap:7 }}><span style={{ width:9, height:9, borderRadius:'50%', background:c }}/><span style={{ fontSize:11, color:T.textSub }}>{l}</span></div>
          ))}
        </div>
      </Card>

      {/* detail panel */}
      {sel ? (
        <Card pad="1.35rem 1.4rem" style={{ width:300, flexShrink:0, height:600, overflowY:'auto' }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
            <span style={{ fontSize:9.5, fontWeight:700, letterSpacing:'0.1em', color:kindMeta[sel.kind].c, padding:'3px 9px', borderRadius:99, background:tint(kindMeta[sel.kind].c,0.12), border:`1px solid ${tint(kindMeta[sel.kind].c,0.3)}`, fontFamily:MONO }}>{kindMeta[sel.kind].l}</span>
            <button onClick={()=>setSel(null)} style={{ background:'none', border:'none', cursor:'pointer', color:T.textDim, fontSize:18, lineHeight:1 }}>×</button>
          </div>
          <div style={{ fontSize:16, fontWeight:600, color:T.text, fontFamily:MONO, wordBreak:'break-all', marginBottom:6 }}>{sel.label}</div>
          <div style={{ fontSize:11.5, color:T.textDim, marginBottom:20 }}>Conectado a anchieta.br</div>
          <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
            {(sel.kind==='sub'?[['Status','200 OK',T.green],['IP','85.31.228.170',T.textSub],['Stack','LiteSpeed · PHP',T.textSub],['TLS','válido',T.green],['Vulns','0',T.textSub]]
              : sel.kind==='ip'?[['Reverse DNS','—',T.textSub],['ASN','AS27715',T.textSub],['Portas','80, 443',T.textSub],['Hosts','3',T.textSub]]
              : sel.kind==='tech'?[['Categoria','Framework',T.textSub],['Instâncias','12 hosts',T.textSub],['CVEs conhecidos','2',T.high]]
              : [['Subdomínios','95',T.textSub],['IPs','52',T.textSub],['Tecnologias','62',T.textSub],['Score','45',T.medium]]
            ).map(([k,v,vc],i)=>(
              <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'0.7rem 0', borderBottom:`1px solid ${T.line}` }}>
                <span style={{ fontSize:12, color:T.textDim }}>{k}</span>
                <span style={{ fontSize:12.5, fontWeight:600, color:vc, fontFamily:MONO }}>{v}</span>
              </div>
            ))}
          </div>
          <Btn variant="soft" icon={IC.finding} style={{ width:'100%', justifyContent:'center', marginTop:18 }}>Ver findings</Btn>
        </Card>
      ) : (
        <Card pad="1.35rem 1.4rem" style={{ width:300, flexShrink:0, height:600, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center' }}>
          <div style={{ width:48, height:48, borderRadius:12, background:T.purpleDim, border:`1px solid ${T.line2}`, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:14 }}><Ico s={22} c={T.purpleL}>{IC.share}</Ico></div>
          <div style={{ fontSize:13.5, fontWeight:600, color:T.text, marginBottom:6 }}>Selecione um nó</div>
          <p style={{ fontSize:12, color:T.textDim, lineHeight:1.5 }}>Clique em qualquer ativo do grafo para ver detalhes, tecnologias e findings relacionados.</p>
        </Card>
      )}
      </div>
    </>
  );
}

Object.assign(window, { Dominios, DominioDetalhe, Mapa, DOMAINS });
