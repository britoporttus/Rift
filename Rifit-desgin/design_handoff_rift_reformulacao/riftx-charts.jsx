/* ═══════════════════════════════════════════════════════════════════════════
   riftx-charts.jsx — visualizações SVG: Donut · Gauge · HBars · Trend · Ring
   ═══════════════════════════════════════════════════════════════════════════ */
const { T, tint, MONO } = window;

/* ─── DONUT ───────────────────────────────────────────────────────────────── */
/* data: [{label, value, color}] ; center shows total + caption */
function Donut({ data, size=176, thickness=20, total, caption, activeKey, onHover }) {
  const sum = data.reduce((a,d)=>a+d.value,0) || 1;
  const R = (size-thickness)/2, C = 2*Math.PI*R;
  let acc = 0;
  const cx = size/2;
  return (
    <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
      <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
        <circle cx={cx} cy={cx} r={R} fill="none" stroke={T.line} strokeWidth={thickness}/>
        {data.map((d,i) => {
          const frac = d.value/sum;
          const len = frac*C;
          const dim = activeKey && activeKey!==d.key;
          const seg = (
            <circle key={i} cx={cx} cy={cx} r={R} fill="none" stroke={d.color}
              strokeWidth={activeKey===d.key ? thickness+3 : thickness}
              strokeDasharray={`${len} ${C-len}`}
              strokeDashoffset={-acc} strokeLinecap="butt"
              onMouseEnter={()=>onHover&&onHover(d.key)} onMouseLeave={()=>onHover&&onHover(null)}
              style={{ opacity: dim?0.28:1, transition:'opacity .18s, stroke-width .18s', cursor:'pointer' }}/>
          );
          acc += len;
          return seg;
        })}
      </svg>
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
        <div style={{ fontSize:size*0.24, fontWeight:700, color:T.text, fontFamily:MONO, lineHeight:1 }}>{total!=null?total:sum}</div>
        {caption && <div style={{ fontSize:10.5, color:T.textDim, marginTop:5, letterSpacing:'0.06em', textTransform:'uppercase' }}>{caption}</div>}
      </div>
    </div>
  );
}

/* ─── GAUGE (semicircle score) ────────────────────────────────────────────── */
function Gauge({ value, max=100, size=200, thickness=16, color, label, sub }) {
  const R = (size-thickness)/2;
  const cx = size/2, cy = size/2;
  const startA = Math.PI, endA = 2*Math.PI;                 // 180° top arc
  const frac = Math.min(1, value/max);
  const pt = (a) => [cx+R*Math.cos(a), cy+R*Math.sin(a)];
  const arc = (a0,a1) => {
    const [x0,y0]=pt(a0),[x1,y1]=pt(a1);
    const large = (a1-a0)>Math.PI ? 1:0;
    return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`;
  };
  return (
    <div style={{ position:'relative', width:size, height:size/2+18, flexShrink:0 }}>
      <svg width={size} height={size/2+18}>
        <path d={arc(startA,endA)} fill="none" stroke={T.line} strokeWidth={thickness} strokeLinecap="round"/>
        <path d={arc(startA, startA+frac*Math.PI)} fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round" style={{ filter:`drop-shadow(0 0 6px ${tint(color,0.5)})` }}/>
      </svg>
      <div style={{ position:'absolute', bottom:0, left:0, right:0, textAlign:'center' }}>
        <div style={{ fontSize:size*0.2, fontWeight:700, color, fontFamily:MONO, lineHeight:1 }}>{value}</div>
        {label && <div style={{ fontSize:10.5, color:T.textDim, marginTop:4, letterSpacing:'0.1em' }}>{label}</div>}
        {sub && <div style={{ fontSize:11, color, marginTop:3, fontWeight:600 }}>{sub}</div>}
      </div>
    </div>
  );
}

/* ─── HORIZONTAL BARS ─────────────────────────────────────────────────────── */
/* data: [{label, value, color}] */
function HBars({ data, max, unit='', showVal=true }) {
  const m = max || Math.max(...data.map(d=>d.value), 1);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:13 }}>
      {data.map((d,i) => (
        <div key={i}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6 }}>
            <span style={{ fontSize:12.5, color:T.textSub }}>{d.label}</span>
            {showVal && <span style={{ fontSize:12.5, fontWeight:700, color:d.color||T.text, fontFamily:MONO }}>{d.value}{unit}</span>}
          </div>
          <div style={{ height:7, borderRadius:99, background:'rgba(255,255,255,0.05)', overflow:'hidden' }}>
            <div style={{ width:`${Math.max(2,d.value/m*100)}%`, height:'100%', background:d.color||T.purple, borderRadius:99, boxShadow:`0 0 8px ${tint(d.color||T.purple,0.5)}` }}/>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── TREND AREA (sparkline w/ fill + dashed projection) ──────────────────── */
function Trend({ points, color=T.purpleL, w=520, h=120, labels, projFrom }) {
  const max = Math.max(...points), min = Math.min(...points);
  const rng = (max-min)||1;
  const pad = 6;
  const xs = points.map((_,i)=> pad + i/(points.length-1)*(w-2*pad));
  const ys = points.map(p => h-pad - (p-min)/rng*(h-2*pad-14));
  const pf = projFrom!=null ? projFrom : points.length-1;   // index where solid ends
  const solidPts = xs.slice(0,pf+1).map((x,i)=>`${x},${ys[i]}`).join(' ');
  const dashPts  = xs.slice(pf).map((x,i)=>`${x},${ys[pf+i]}`).join(' ');
  const area = `${xs[0]},${h} ${xs.slice(0,pf+1).map((x,i)=>`${x},${ys[i]}`).join(' ')} ${xs[pf]},${h}`;
  const id = 'grad'+Math.random().toString(36).slice(2,7);
  return (
    <div style={{ width:'100%' }}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width:'100%', height:h, display:'block' }}>
        <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tint(color,0.35)}/><stop offset="100%" stopColor={tint(color,0)}/>
        </linearGradient></defs>
        <polygon points={area} fill={`url(#${id})`}/>
        <polyline points={solidPts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
        {pf<points.length-1 && <polyline points={dashPts} fill="none" stroke={tint(color,0.55)} strokeWidth="2" strokeDasharray="5 5" strokeLinejoin="round" strokeLinecap="round"/>}
        <circle cx={xs[pf]} cy={ys[pf]} r={3.5} fill={color}/>
      </svg>
      {labels && <div style={{ display:'flex', justifyContent:'space-between', marginTop:8 }}>{labels.map((l,i)=><span key={i} style={{ fontSize:10, color:T.textFaint, fontFamily:MONO }}>{l}</span>)}</div>}
    </div>
  );
}

/* ─── SCORE SLIDER (Neo-style horizontal red→green gauge) ──────────────────── */
function ScoreSlider({ value, max=100, label, color }) {
  const frac = Math.min(1, value/max);
  return (
    <div style={{ width:'100%' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
        <span style={{ fontSize:40, fontWeight:700, color:T.text, fontFamily:MONO, lineHeight:1 }}>{value}</span>
        {label && <span style={{ fontSize:11.5, fontWeight:700, color, padding:'4px 10px', borderRadius:99, background:tint(color,0.12), border:`1px solid ${tint(color,0.3)}` }}>{label}</span>}
      </div>
      <div style={{ position:'relative', height:8, borderRadius:99, background:'linear-gradient(90deg,#F04452 0%,#F5892E 30%,#EAB308 55%,#22C55E 100%)' }}>
        <div style={{ position:'absolute', top:'50%', left:`${frac*100}%`, transform:'translate(-50%,-50%)', width:16, height:16, borderRadius:'50%', background:'#fff', border:`3px solid ${color}`, boxShadow:'0 2px 8px rgba(0,0,0,0.5)' }}/>
      </div>
    </div>
  );
}

/* ─── MINI STACKED BAR (severity per row) ─────────────────────────────────── */
function StackBar({ segs, height=6 }) {
  const sum = segs.reduce((a,s)=>a+s.v,0)||1;
  return (
    <div style={{ display:'flex', height, borderRadius:99, overflow:'hidden', gap:1, background:'rgba(255,255,255,0.04)' }}>
      {segs.filter(s=>s.v>0).map((s,i)=><div key={i} style={{ flex:s.v, background:s.c }} title={`${s.v}`}/>)}
    </div>
  );
}

Object.assign(window, { Donut, Gauge, HBars, Trend, StackBar, ScoreSlider });
