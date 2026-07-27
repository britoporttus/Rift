/* ═══════════════════════════════════════════════════════════════════════════
   riftx-core.jsx — Rift reformulado · design tokens + primitivos + chrome
   Foco: clareza. Hierarquia forte, respiro, cor só com significado.
   ═══════════════════════════════════════════════════════════════════════════ */
const { useState, useRef, useEffect } = React;

/* ─── TOKENS ──────────────────────────────────────────────────────────────── */
const T = {
  bg:'#0A0A12', panel:'#0B0B13',
  surface:'#111119', surface2:'#16161F', raised:'#1A1A24',
  line:'rgba(140,120,225,0.09)', line2:'rgba(140,120,225,0.18)', line3:'rgba(140,120,225,0.30)',
  purple:'#7C3AED', purpleL:'#A78BFA', purpleD:'#6D28D9',
  purpleDim:'rgba(124,58,237,0.10)', purpleGlow:'rgba(124,58,237,0.35)',
  text:'#EBEDF4', textSub:'#A6ACC0', textDim:'#71768C', textFaint:'#4A4F66',
  critical:'#F04452', high:'#F5892E', medium:'#EAB308', low:'#22C55E', info:'#3B82F6',
  green:'#22C55E', red:'#F04452', orange:'#F5892E', yellow:'#EAB308', blue:'#3B82F6',
};

/* severity → color / bg / border helpers */
const SEV = {
  critical:{ c:T.critical, label:'CRITICAL' }, high:{ c:T.high, label:'HIGH' },
  medium:{ c:T.medium, label:'MEDIUM' }, low:{ c:T.low, label:'LOW' }, info:{ c:T.info, label:'INFO' },
};
const tint = (hex, a) => { const h=hex.replace('#',''); const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16); return `rgba(${r},${g},${b},${a})`; };

const GRID_BG = {
  backgroundImage:'linear-gradient(rgba(124,58,237,0.020) 1px,transparent 1px),linear-gradient(90deg,rgba(124,58,237,0.020) 1px,transparent 1px)',
  backgroundSize:'44px 44px',
};
const MONO = "'JetBrains Mono',monospace";
const SANS = "'Space Grotesk',sans-serif";

/* ─── ICON ────────────────────────────────────────────────────────────────── */
function Ico({ s=16, c='currentColor', sw=1.7, style, children }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c}
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink:0, display:'block', ...style }}>{children}</svg>
  );
}
const IC = {
  dashboard:<><rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/></>,
  globe:<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18"/></>,
  leak:<><path d="M12 22a7 7 0 007-7c0-2-1-3.9-3-5.5S12 5 12 2C12 5 9 7.5 8 9.5S5 13 5 15a7 7 0 007 7z"/></>,
  map:<><polygon points="1 6 8 3 16 6 23 3 23 18 16 21 8 18 1 21 1 6"/><line x1="8" y1="3" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="21"/></>,
  finding:<><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
  report:<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></>,
  users:<><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></>,
  admin:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></>,
  target:<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/></>,
  plus:<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
  play:<polygon points="6 4 20 12 6 20 6 4"/>,
  scan:<><circle cx="12" cy="12" r="9"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="3.5"/></>,
  chevR:<polyline points="9 6 15 12 9 18"/>,
  chevL:<polyline points="15 6 9 12 15 18"/>,
  chevD:<polyline points="6 9 12 15 18 9"/>,
  arrowL:<><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>,
  collapse:<><polyline points="15 18 9 12 15 6"/><line x1="20" y1="12" x2="9" y2="12"/></>,
  expand:<><polyline points="9 18 15 12 9 6"/><line x1="4" y1="12" x2="15" y2="12"/></>,
  logout:<><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
  search:<><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
  refresh:<><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></>,
  clock:<><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></>,
  dollar:<><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>,
  check:<polyline points="20 6 9 17 4 12"/>,
  checkCirc:<><circle cx="12" cy="12" r="9"/><polyline points="8.5 12 11 14.5 16 9"/></>,
  circle:<circle cx="12" cy="12" r="9"/>,
  alert:<><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
  shield:<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
  shieldCheck:<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></>,
  bug:<><rect x="8" y="6" width="8" height="14" rx="4"/><path d="M12 6V3M8 9L5 7M16 9l3-2M8 20l-3 2M16 20l3 2M8 13H4M20 13h-4"/></>,
  calendar:<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></>,
  wifi:<><path d="M5 12.55a11 11 0 0114 0M8.5 16.1a6 6 0 017 0M2 8.82a15 15 0 0120 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></>,
  layers:<><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>,
  cpu:<><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/></>,
  eye:<><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></>,
  trash:<><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></>,
  share:<><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.5" x2="15.4" y2="6.5"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/></>,
  flag:<><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></>,
  terminal:<><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></>,
  history:<><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 106 5.3L3 8"/><polyline points="12 7 12 12 15 14"/></>,
  server:<><rect x="2" y="3" width="20" height="7" rx="1.5"/><rect x="2" y="14" width="20" height="7" rx="1.5"/><line x1="6" y1="6.5" x2="6.01" y2="6.5"/><line x1="6" y1="17.5" x2="6.01" y2="17.5"/></>,
  filter:<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>,
  key:<><path d="M21 2l-2 2m-7.6 7.6a5 5 0 11-7-7 5 5 0 017 7zm0 0L15 15m0 0l3 3m-3-3l-2 2"/></>,
};

/* ─── PRIMITIVES ──────────────────────────────────────────────────────────── */
function SevBadge({ sev, size='sm' }) {
  const s = SEV[sev]; if (!s) return null;
  const p = size==='sm' ? '2px 7px' : '3px 9px';
  const f = size==='sm' ? 9.5 : 10.5;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:p, borderRadius:4,
      background:tint(s.c,0.12), border:`1px solid ${tint(s.c,0.32)}`, color:s.c,
      fontSize:f, fontWeight:700, letterSpacing:'0.06em', fontFamily:MONO, whiteSpace:'nowrap' }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:s.c }}/>{s.label}
    </span>
  );
}

function Tag({ children, color=T.textDim, filled=false }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:99,
      fontSize:10, fontWeight:600, whiteSpace:'nowrap', fontFamily:MONO,
      background: filled ? tint(color,0.12) : 'transparent',
      border:`1px solid ${filled ? tint(color,0.3) : T.line2}`, color:filled ? color : T.textDim }}>
      {children}
    </span>
  );
}

function StatusPill({ status }) {
  const map = {
    'Concluído':{ c:T.green, l:'CONCLUÍDO' }, 'Parado':{ c:T.orange, l:'PARADO' },
    'Rodando':{ c:T.blue, l:'RODANDO' }, 'idle':{ c:T.purpleL, l:'idle' },
    'autorizado':{ c:T.green, l:'autorizado' },
  };
  const m = map[status] || { c:T.textDim, l:status };
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'2px 9px', borderRadius:99,
      background:tint(m.c,0.10), border:`1px solid ${tint(m.c,0.28)}`, color:m.c,
      fontSize:9.5, fontWeight:700, letterSpacing:'0.05em', fontFamily:MONO }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:m.c }}/>{m.l}
    </span>
  );
}

function Card({ children, pad='1.15rem 1.25rem', accent, hover, onClick, style }) {
  const [h, setH] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{ background:T.surface, border:`1px solid ${h&&hover ? T.line2 : T.line}`, borderRadius:12,
        padding:pad, position:'relative', overflow:'hidden', cursor:onClick?'pointer':'default',
        transition:'border-color .14s, box-shadow .14s, transform .14s',
        boxShadow: h&&hover ? '0 8px 30px rgba(0,0,0,0.35)' : 'none',
        transform: h&&hover ? 'translateY(-1px)' : 'none', ...style }}>
      {accent && <div style={{ position:'absolute', left:0, top:0, bottom:0, width:3, background:accent }}/>}
      {children}
    </div>
  );
}

/* Big stat / KPI card */
function StatCard({ icon, value, label, sub, color=T.purpleL, accent }) {
  return (
    <Card pad="1.1rem 1.25rem" accent={accent||color} hover>
      <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
        <div style={{ width:42, height:42, borderRadius:10, flexShrink:0, display:'flex', alignItems:'center',
          justifyContent:'center', background:tint(color,0.12), border:`1px solid ${tint(color,0.25)}` }}>
          <Ico s={20} c={color} sw={1.9}>{icon}</Ico>
        </div>
        <div style={{ minWidth:0 }}>
          <div style={{ fontSize:34, fontWeight:700, color, lineHeight:1, fontFamily:MONO, letterSpacing:'-0.02em' }}>{value}</div>
          <div style={{ fontSize:12.5, fontWeight:600, color:T.text, marginTop:7 }}>{label}</div>
          {sub && <div style={{ fontSize:11, color:T.textDim, marginTop:2 }}>{sub}</div>}
        </div>
      </div>
    </Card>
  );
}

/* Button */
function Btn({ children, variant='ghost', icon, onClick, size='md', style }) {
  const [h, setH] = useState(false);
  const pad = size==='sm' ? '0.4rem 0.75rem' : '0.5rem 1rem';
  const fs = size==='sm' ? 12 : 12.5;
  const V = {
    primary:{ bg:h?T.purpleD:T.purple, bd:T.purple, c:'#fff', sh:`0 0 20px ${T.purpleGlow}` },
    soft:{ bg:h?tint(T.purple,0.18):T.purpleDim, bd:T.line3, c:T.purpleL, sh:'none' },
    ghost:{ bg:h?T.surface2:T.surface, bd:h?T.line2:T.line, c:T.textSub, sh:'none' },
    danger:{ bg:h?tint(T.red,0.15):tint(T.red,0.08), bd:tint(T.red,0.3), c:T.red, sh:'none' },
  }[variant];
  return (
    <button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{ display:'inline-flex', alignItems:'center', gap:7, padding:pad, borderRadius:8,
        background:V.bg, border:`1px solid ${V.bd}`, color:V.c, fontSize:fs, fontWeight:600,
        fontFamily:SANS, cursor:'pointer', whiteSpace:'nowrap', boxShadow:V.sh, transition:'all .13s', ...style }}>
      {icon && <Ico s={size==='sm'?13:15} c={V.c} sw={2}>{icon}</Ico>}
      {children}
    </button>
  );
}

/* Section title */
function SectionHead({ children, count, right }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
      <div style={{ display:'flex', alignItems:'baseline', gap:9 }}>
        <span style={{ fontSize:11.5, fontWeight:700, color:T.textDim, letterSpacing:'0.14em', textTransform:'uppercase' }}>{children}</span>
        {count!=null && <span style={{ fontSize:11, color:T.textFaint, fontFamily:MONO }}>({count})</span>}
      </div>
      {right}
    </div>
  );
}

/* Page header (title + subtitle) */
function PageHead({ icon, title, subtitle, right }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:20, marginBottom:22 }}>
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:11 }}>
          {icon && <div style={{ width:34, height:34, borderRadius:9, background:T.purpleDim, border:`1px solid ${T.line2}`, display:'flex', alignItems:'center', justifyContent:'center' }}><Ico s={18} c={T.purpleL} sw={1.9}>{icon}</Ico></div>}
          <h1 style={{ fontSize:24, fontWeight:700, color:T.text, letterSpacing:'-0.01em' }}>{title}</h1>
        </div>
        {subtitle && <p style={{ fontSize:13.5, color:T.textSub, marginTop:9, maxWidth:640, lineHeight:1.5 }}>{subtitle}</p>}
      </div>
      {right && <div style={{ flexShrink:0, display:'flex', gap:10, alignItems:'center' }}>{right}</div>}
    </div>
  );
}

/* ─── SIDEBAR ─────────────────────────────────────────────────────────────── */
const NAV = [
  { id:'dashboard', label:'Dashboard',  icon:IC.dashboard },
  { id:'dominios',  label:'Domínios',   icon:IC.globe },
  { id:'vazamentos',label:'Vazamentos', icon:IC.leak },
  { id:'mapa',      label:'Mapa',       icon:IC.map },
  { id:'findings',  label:'Findings',   icon:IC.finding, badge:'18' },
  { id:'relatorios',label:'Relatórios', icon:IC.report },
  { id:'usuarios',  label:'Usuários',   icon:IC.users },
  { id:'admin',     label:'Admin',      icon:IC.admin },
];

function Sidebar({ active, onNav, collapsed, onToggle }) {
  return (
    <aside style={{ width: collapsed ? 62 : 232, flexShrink:0, transition:'width .22s ease',
      background:T.panel, borderRight:`1px solid ${T.line}`, display:'flex', flexDirection:'column', overflow:'hidden', zIndex:10 }}>
      {/* logo */}
      <div style={{ height:60, flexShrink:0, display:'flex', alignItems:'center',
        justifyContent: collapsed?'center':'flex-start', padding: collapsed?0:'0 1.15rem', gap:11, borderBottom:`1px solid ${T.line}` }}>
        <div style={{ width:34, height:34, borderRadius:9, background:`linear-gradient(140deg,${T.purple},${T.purpleD})`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:`0 0 16px ${T.purpleGlow}` }}>
          <Ico s={17} c="#fff" sw={2.1}>{IC.target}</Ico>
        </div>
        {!collapsed && (
          <div style={{ whiteSpace:'nowrap' }}>
            <div style={{ fontSize:16, fontWeight:700, color:T.text, letterSpacing:'0.16em', lineHeight:1 }}>RIFT</div>
            <div style={{ fontSize:8.5, color:T.textDim, letterSpacing:'0.24em', marginTop:3 }}>AI PENTEST</div>
          </div>
        )}
      </div>
      {/* nav */}
      <nav style={{ flex:1, padding: collapsed?'0.75rem 0.5rem':'0.75rem 0.6rem', display:'flex', flexDirection:'column', gap:3 }}>
        {NAV.map(n => {
          const isA = active===n.id;
          return (
            <button key={n.id} onClick={()=>onNav(n.id)} title={collapsed?n.label:undefined}
              style={{ display:'flex', alignItems:'center', gap: collapsed?0:12,
                justifyContent: collapsed?'center':'flex-start', width:'100%', height:40,
                padding: collapsed?0:'0 0.85rem', position:'relative',
                background: isA ? T.purpleDim : 'transparent', border:'none', borderRadius:8,
                cursor:'pointer', fontFamily:SANS, fontSize:13.5, fontWeight: isA?600:500,
                color: isA ? T.purpleL : T.textDim, textAlign:'left', transition:'all .12s', outline:'none' }}>
              {isA && <span style={{ position:'absolute', left:0, top:8, bottom:8, width:3, borderRadius:99, background:T.purple, display: collapsed?'none':'block' }}/>}
              <Ico s={17} c={isA?T.purpleL:T.textDim} sw={isA?2:1.7}>{n.icon}</Ico>
              {!collapsed && <span style={{ whiteSpace:'nowrap', flex:1 }}>{n.label}</span>}
              {!collapsed && n.badge && <span style={{ fontSize:9.5, fontWeight:700, color:T.high, background:tint(T.high,0.14), padding:'1px 7px', borderRadius:99, fontFamily:MONO }}>{n.badge}</span>}
            </button>
          );
        })}
      </nav>
      {/* footer */}
      <div style={{ borderTop:`1px solid ${T.line}` }}>
        <button onClick={onToggle} style={{ width:'100%', height:38, display:'flex', alignItems:'center',
          justifyContent: collapsed?'center':'flex-end', paddingRight: collapsed?0:'1.15rem',
          background:'none', border:'none', cursor:'pointer', color:T.textDim, transition:'color .12s' }}>
          <Ico s={16} c="currentColor">{collapsed?IC.expand:IC.collapse}</Ico>
        </button>
        <div style={{ padding: collapsed?'0.7rem 0':'0.85rem 1.05rem', display:'flex', alignItems:'center', gap: collapsed?0:10, justifyContent: collapsed?'center':'flex-start', borderTop:`1px solid ${T.line}` }}>
          <div style={{ width:32, height:32, borderRadius:'50%', background:T.purpleDim, border:`1px solid ${T.line2}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10.5, fontWeight:700, color:T.purpleL, flexShrink:0, fontFamily:MONO }}>JB</div>
          {!collapsed && (
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:600, color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>João Brito</div>
              <div style={{ fontSize:10, color:T.textDim, fontFamily:MONO }}>// admin</div>
            </div>
          )}
          {!collapsed && <button style={{ background:'none', border:'none', cursor:'pointer', color:T.textDim, padding:4 }}><Ico s={16} c="currentColor">{IC.logout}</Ico></button>}
        </div>
      </div>
    </aside>
  );
}

/* ─── TOP BAR ─────────────────────────────────────────────────────────────── */
function TopBar({ crumbs=[], right }) {
  return (
    <div style={{ height:60, flexShrink:0, background:T.panel, borderBottom:`1px solid ${T.line}`,
      display:'flex', alignItems:'center', padding:'0 1.75rem', gap:9, zIndex:5 }}>
      {crumbs.map((c,i) => (
        <React.Fragment key={i}>
          {i>0 && <Ico s={13} c={T.textFaint}>{IC.chevR}</Ico>}
          <span style={{ fontSize:13, fontWeight: i===crumbs.length-1?600:400,
            color: i===crumbs.length-1?T.text:T.textDim }}>{c}</span>
        </React.Fragment>
      ))}
      <div style={{ marginLeft:'auto', display:'flex', gap:14, alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11.5, color:T.green, fontFamily:MONO }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:T.green, boxShadow:`0 0 8px ${T.green}` }}/>
          Sistema online
        </div>
        {right}
      </div>
    </div>
  );
}

/* App shell frame */
function Shell({ active, onNav, collapsed, onToggle, crumbs, topRight, children }) {
  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:T.bg, color:T.text, fontFamily:SANS }}>
      <Sidebar active={active} onNav={onNav} collapsed={collapsed} onToggle={onToggle}/>
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <TopBar crumbs={crumbs} right={topRight}/>
        <div style={{ flex:1, overflowY:'auto', ...GRID_BG }}>
          <div style={{ maxWidth:1320, margin:'0 auto', padding:'26px 32px 60px', animation:'fadeIn .22s ease' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  T, SEV, tint, GRID_BG, MONO, SANS, Ico, IC,
  SevBadge, Tag, StatusPill, Card, StatCard, Btn, SectionHead, PageHead,
  Sidebar, TopBar, Shell, NAV,
});
