/**
 * CSS da home pública.
 *
 * Por que um bloco de <style> e não o padrão inline do resto do repo: esta
 * página precisa de @keyframes, pseudo-elementos, conic-gradient com máscara e
 * media queries — nada disso existe em `style={{}}`. O repo já usa esse escape
 * pontualmente (ver `app/(app)/dominios/page.tsx`).
 *
 * Tudo está escopado em `.rl` para que os tokens da landing NÃO vazem para o
 * app. O app continua lendo `globals.css` sem saber que esta página existe.
 *
 * ⚠ CUIDADO COM NOME DE CLASSE: `globals.css` faz `@tailwind utilities`, e essas
 * utilidades são GLOBAIS — o escopo `.rl` protege os tokens, não os nomes. Os
 * anéis da órbita se chamavam `.ring` e herdavam silenciosamente o
 * `box-shadow: 0 0 0 3px rgba(59,130,246,.5)` da utilidade `ring` do Tailwind:
 * um halo azul de 3px colado em cada círculo, que nenhuma regra daqui explicava.
 * Daí o prefixo `o-` em `.o-ring`. Antes de batizar uma classe com nome de
 * utilidade comum (ring, container, grid, block, hidden, truncate…), confira.
 */
export function LandingStyles() {
  return (
    <style>{`
/* ── tons ────────────────────────────────────────────────────────────────── */
.rl{
  --mono:'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --display:'Space Grotesk', system-ui, -apple-system, 'Segoe UI', sans-serif;
}
/* Um acento só. As cores de apoio (ciano/rosa) saíram: contra o acento forte
   elas competiam em vez de acompanhar. Onde havia bloco sólido de cor, agora há
   preto com o acento em detalhe — a cor pontua, não preenche. */
.rl[data-tom="lime"]{
  --bg:#06070A; --bg2:#0A0C10; --surface:#0E1014; --raised:#15181D;
  --accent:#CCFF00; --accent-2:#A5CF00; --ink:#080A00;
  --line:rgba(255,255,255,.085); --line-hi:rgba(255,255,255,.19);
  --ring:color-mix(in srgb, var(--accent) 26%, transparent);
  --text:#EEF0F3; --muted:#98A0AC; --dim:#5C6470;
}
.rl[data-tom="laranja"]{
  --bg:#080605; --bg2:#0D0908; --surface:#120D0B; --raised:#1A1311;
  --accent:#FF4D1C; --accent-2:#C93A12; --ink:#0B0201;
  --line:rgba(255,255,255,.085); --line-hi:rgba(255,255,255,.19);
  --ring:color-mix(in srgb, var(--accent) 26%, transparent);
  --text:#F3EEEB; --muted:#ABA09A; --dim:#6C625C;
}
.rl[data-tom="roxo"]{
  --bg:#06060A; --bg2:#0A0A11; --surface:#0F0F16; --raised:#16161F;
  --accent:#7C3AED; --accent-2:#A78BFA; --ink:#FFFFFF;
  --line:rgba(255,255,255,.08); --line-hi:rgba(255,255,255,.18);
  --ring:color-mix(in srgb, var(--accent) 26%, transparent);
  --text:#ECEEF4; --muted:#A4AABC; --dim:#5E6478;
}

/* ── base ──────────────────────────────────────────────────────────────── */
/* overflow-x:clip e NÃO hidden. Com hidden, .rl vira um contêiner de rolagem e o
   position:sticky do ato orbital deixa de grudar na viewport — a órbita subia
   junto com a página e a seção inteira aparecia em branco. clip corta o
   transbordo horizontal sem criar contêiner de rolagem. */
.rl{ background:var(--bg); color:var(--text); font-family:var(--display);
  min-height:100vh; overflow-x:clip; transition:background .35s ease, color .35s ease }
.rl *{ box-sizing:border-box }
.rl button{ font:inherit; color:inherit; background:none; border:none; cursor:pointer }
.rl a{ color:inherit; text-decoration:none }
.rl :focus-visible{ outline:2px solid var(--accent); outline-offset:3px }

.rl .wrap{ width:min(1200px, 92vw); margin:0 auto }
/* a nav é fixa: sem isto, clicar em "Entrega" para a seção com o título
   escondido atrás da barra */
.rl [id]{ scroll-margin-top:86px }
@media (prefers-reduced-motion: no-preference){ html{ scroll-behavior:smooth } }
.rl .kick{ font-family:var(--mono); font-size:10.5px; letter-spacing:.24em;
  text-transform:uppercase; color:var(--dim); display:flex; align-items:center; gap:11px }
.rl .kick::before{ content:''; width:26px; height:1px; background:var(--accent); flex-shrink:0 }
.rl .lead{ font-size:clamp(15px,1.5vw,17px); line-height:1.65; color:var(--muted);
  max-width:60ch }

/* ── navegação ─────────────────────────────────────────────────────────── */
.rl .nav{ position:fixed; inset:0 0 auto; z-index:60; height:62px; display:flex;
  align-items:center; backdrop-filter:blur(14px);
  background:color-mix(in srgb, var(--bg) 80%, transparent);
  border-bottom:1px solid transparent; transition:border-color .3s }
.rl .nav[data-stuck="1"]{ border-bottom-color:var(--line) }
.rl .nav-row{ display:flex; align-items:center; gap:24px }
.rl .mark{ display:flex; align-items:center; gap:10px }
.rl .mark-g{ width:28px; height:28px; display:grid; place-items:center; flex-shrink:0;
  background:var(--accent); color:var(--ink); font-family:var(--mono);
  font-weight:700; font-size:14px }
.rl .mark-t{ font-size:16px; font-weight:700; letter-spacing:.13em }
/* ── menus da navegação ────────────────────────────────────────────────── */
.rl .nav-menus{ display:flex; align-items:center; gap:2px; margin-right:auto }
.rl .nav-slot{ position:relative }
.rl .nav-trg, .rl .nav-lnk{ display:inline-flex; align-items:center; gap:6px;
  padding:8px 12px; font-family:var(--mono); font-size:11px; letter-spacing:.13em;
  text-transform:uppercase; color:var(--muted); transition:color .15s, background .15s }
.rl .nav-trg:hover, .rl .nav-lnk:hover{ color:var(--text); background:var(--surface) }
.rl .nav-trg[data-on="1"], .rl .nav-lnk[data-on="1"]{ color:var(--accent) }
.rl .nav-trg .chev{ opacity:.55; transition:transform .22s ease }
.rl .nav-trg[aria-expanded="true"]{ color:var(--text) }
.rl .nav-trg[aria-expanded="true"] .chev{ transform:rotate(180deg); opacity:1 }
.rl .nav-acts{ display:flex; align-items:center; gap:8px }

/* painel suspenso: some por altura+opacidade para animar sem reflow do resto */
.rl .nav-panel{ position:absolute; left:0; right:0; top:100%;
  pointer-events:none; opacity:0; transform:translateY(-6px);
  transition:opacity .18s ease, transform .18s ease, visibility .18s;
  visibility:hidden; padding-bottom:12px }
.rl .nav-panel[data-open="1"]{ opacity:1; transform:none; pointer-events:auto; visibility:visible }
.rl .panel-box{ background:var(--surface); border:1px solid var(--line-hi);
  box-shadow:0 30px 70px rgba(0,0,0,.6); max-width:720px }
.rl .panel-grid{ display:grid; grid-template-columns:repeat(3, 1fr); gap:2px;
  padding:10px; }
.rl .panel-grid.two{ grid-template-columns:repeat(3, 1fr) }
.rl .panel-lnk{ display:flex; align-items:flex-start; gap:11px; padding:11px;
  transition:background .14s }
.rl .panel-lnk:hover{ background:var(--raised) }
.rl .panel-ico{ flex-shrink:0; width:34px; height:34px; display:grid; place-items:center;
  background:var(--bg); border:1px solid var(--line-hi); color:var(--accent) }
.rl .panel-txt{ display:flex; flex-direction:column; gap:3px; min-width:0 }
.rl .panel-h{ display:flex; align-items:center; gap:7px; font-size:13.5px; font-weight:600;
  color:var(--text) }
.rl .panel-soon{ font-style:normal; font-family:var(--mono); font-size:7.5px;
  letter-spacing:.12em; text-transform:uppercase; color:var(--dim);
  border:1px solid var(--line-hi); padding:1px 4px }
.rl .panel-d{ font-size:11.5px; line-height:1.45; color:var(--muted) }
.rl .panel-foot{ display:flex; align-items:center; justify-content:space-between; gap:14px;
  padding:11px 16px; border-top:1px solid var(--line); background:var(--bg2);
  font-size:12px; color:var(--muted); flex-wrap:wrap }
.rl .panel-foot a{ display:inline-flex; align-items:center; gap:6px; color:var(--accent);
  font-weight:600 }
.rl .panel-foot a:hover{ text-decoration:underline }

/* ── sanduíche ─────────────────────────────────────────────────────────── */
.rl .burger{ display:none; width:38px; height:38px; place-items:center;
  border:1px solid var(--line-hi); color:var(--text) }
.rl .burger-svg{ width:19px; height:19px; transition:transform .3s ease-in-out }
.rl .burger-svg[data-open="1"]{ transform:rotate(-45deg) }
.rl .burger-a{ stroke-dasharray:12 63; transition:stroke-dasharray .3s ease-in-out,
  stroke-dashoffset .3s ease-in-out }
.rl .burger-svg[data-open="1"] .burger-a{ stroke-dasharray:20 300; stroke-dashoffset:-32.42px }

.rl .mob{ position:fixed; inset:62px 0 0; z-index:55; overflow-y:auto;
  background:color-mix(in srgb, var(--bg) 97%, transparent); backdrop-filter:blur(16px);
  border-top:1px solid var(--line); animation:rlMobIn .22s ease }
@keyframes rlMobIn{ from{ opacity:0; transform:translateY(-8px) } }
.rl .mob-in{ padding:18px 5vw 40px; display:flex; flex-direction:column; gap:4px }
.rl .mob-t{ font-family:var(--mono); font-size:9.5px; letter-spacing:.2em;
  text-transform:uppercase; color:var(--dim); padding:16px 11px 6px }
.rl .mob-acts{ display:flex; flex-direction:column; gap:8px; margin-top:18px; padding:0 11px }
.rl .mob-acts .btn{ justify-content:center }

.rl .btn{ display:inline-flex; align-items:center; gap:8px; padding:11px 20px;
  font-family:var(--mono); font-size:11px; font-weight:700; letter-spacing:.14em;
  text-transform:uppercase; border:1px solid var(--line-hi); color:var(--text);
  transition:border-color .16s, background .16s, color .16s; white-space:nowrap }
.rl .btn:hover{ border-color:var(--text) }
.rl .btn-p{ background:var(--accent); color:var(--ink); border-color:var(--accent) }
.rl .btn-p:hover{ filter:brightness(1.1); color:var(--ink) }
.rl .btn-lg{ padding:15px 28px; font-size:12px }

/* ── hero do túnel (GridScan) ──────────────────────────────────────────── */
.rl .scanhero{ position:relative; height:280vh }
.rl .scanhero-stage{ position:sticky; top:0; height:100svh; overflow:hidden;
  display:grid; place-items:center; background:#000; cursor:crosshair }
.rl .gs-canvas{ position:absolute; inset:0; width:100%; height:100%; display:block }
/* Vinheta leve: só o suficiente para o RIFT ter contraste e para a emenda com a
   próxima seção não ter costura. Escurecer mais mata o grid, que é o efeito. */
.rl .scanhero-vig{ position:absolute; inset:0; pointer-events:none;
  background:
    radial-gradient(40% 30% at 50% 47%, rgba(0,0,0,.55), transparent 70%),
    linear-gradient(180deg, rgba(0,0,0,.45), transparent 18%, transparent 82%, var(--bg)) }

.rl .scanhero-copy{ position:relative; z-index:2; text-align:center; pointer-events:none;
  display:flex; flex-direction:column; align-items:center; gap:16px;
  transform:scale(var(--copyScale, 1)); opacity:var(--copyFade, 1);
  will-change:transform, opacity }
.rl .scanhero-h1{ margin:0; font-size:clamp(76px, 17vw, 230px); font-weight:700;
  line-height:.82; letter-spacing:-.055em; color:var(--text);
  text-shadow:0 0 90px color-mix(in srgb, var(--accent) 26%, transparent) }
.rl .scanhero-sub{ margin:0; font-family:var(--mono); font-size:clamp(11px, 1.5vw, 15px);
  letter-spacing:.34em; text-transform:uppercase; color:var(--muted) }

.rl .scanhero-cue{ position:absolute; left:0; right:0; bottom:30px; z-index:2;
  text-align:center; font-family:var(--mono); font-size:9.5px; letter-spacing:.22em;
  text-transform:uppercase; color:var(--dim); pointer-events:none;
  opacity:var(--cueFade, 1);
  display:flex; flex-direction:column; align-items:center; gap:9px }
.rl .scanhero-cue i{ display:block; width:1px; height:34px;
  background:linear-gradient(var(--accent), transparent); animation:rlDrop 2.1s ease-in-out infinite }

/* ── abertura, logo depois do mergulho ─────────────────────────────────────
   Duas colunas: o argumento à esquerda, o produto à direita. A esquerda entra
   primeiro (da esquerda), a direita depois (da direita) — a leitura ganha uma
   ordem em vez de tudo aparecer junto. */
.rl .intro{ position:relative; padding:clamp(48px,6vh,86px) 0 clamp(60px,8vh,100px) }
.rl .intro-grid{ display:grid; grid-template-columns:1fr 1fr; gap:clamp(28px,4vw,64px);
  align-items:center }
.rl .intro-l{ display:flex; flex-direction:column; gap:22px }
.rl .intro-l h2{ margin:0; font-size:clamp(30px,4vw,52px); font-weight:700;
  letter-spacing:-.04em; line-height:1.02; text-transform:uppercase; text-wrap:balance }
.rl .intro-l h2 em{ font-style:normal; color:var(--accent); display:block }

/* painel do produto — ilustração da tela real de execução */
.rl .panel{ border:1px solid var(--line-hi); background:var(--surface);
  display:flex; flex-direction:column }
.rl .panel-hd{ display:flex; align-items:center; gap:10px; padding:13px 16px;
  border-bottom:1px solid var(--line); background:var(--bg2) }
.rl .panel-dot{ width:6px; height:6px; border-radius:50%; background:var(--accent);
  box-shadow:0 0 8px var(--accent); animation:rlBreathe 2.2s ease-in-out infinite; flex-shrink:0 }
.rl .panel-host{ font-family:var(--mono); font-size:11.5px; color:var(--text);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.rl .panel-st{ margin-left:auto; font-family:var(--mono); font-size:8.5px; letter-spacing:.14em;
  text-transform:uppercase; color:var(--accent); border:1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  padding:3px 7px; white-space:nowrap }

.rl .panel-kpis{ display:grid; grid-template-columns:repeat(3,1fr);
  border-bottom:1px solid var(--line) }
.rl .panel-kpi{ padding:15px 16px; border-right:1px solid var(--line) }
.rl .panel-kpi:last-child{ border-right:none }
.rl .panel-kpi b{ display:block; font-family:var(--mono); font-size:23px; font-weight:700;
  line-height:1; font-variant-numeric:tabular-nums; color:var(--text) }
.rl .panel-kpi span{ display:block; margin-top:6px; font-family:var(--mono); font-size:8.5px;
  letter-spacing:.14em; text-transform:uppercase; color:var(--dim) }

.rl .panel-sec{ padding:14px 16px 6px; font-family:var(--mono); font-size:8.5px;
  letter-spacing:.18em; text-transform:uppercase; color:var(--dim) }
.rl .phases{ display:flex; flex-direction:column; gap:9px; padding:0 16px 14px }
.rl .phase{ display:grid; grid-template-columns:64px 1fr auto; gap:11px; align-items:center;
  font-family:var(--mono); font-size:10px; color:var(--dim) }
.rl .phase-bar{ height:3px; background:color-mix(in srgb, var(--text) 9%, transparent) }
.rl .phase-bar i{ display:block; height:100%; background:var(--accent) }
.rl .phase[data-s="fila"] .phase-bar i{ background:color-mix(in srgb, var(--text) 22%, transparent) }
.rl .phase-s{ letter-spacing:.1em; text-transform:uppercase; font-size:8.5px }
.rl .phase[data-s="ok"] .phase-s{ color:var(--accent) }

.rl .panel-finds{ border-top:1px solid var(--line); display:flex; flex-direction:column }
.rl .find{ display:flex; align-items:center; gap:10px; padding:11px 16px;
  border-bottom:1px solid var(--line) }
.rl .find:last-child{ border-bottom:none }
.rl .find-sev{ width:3px; align-self:stretch; flex-shrink:0 }
.rl .find-t{ font-size:12px; color:var(--text); overflow:hidden; text-overflow:ellipsis;
  white-space:nowrap }
.rl .find-b{ margin-left:auto; font-family:var(--mono); font-size:8px; font-weight:700;
  letter-spacing:.12em; text-transform:uppercase; padding:2px 6px; white-space:nowrap }

/* ── hero ──────────────────────────────────────────────────────────────── */
.rl .hero{ min-height:100svh; display:flex; align-items:center; position:relative;
  padding:112px 0 72px; overflow:hidden }
.rl .hero-bg{ position:absolute; inset:0; z-index:0; pointer-events:none;
  background:
    radial-gradient(900px 620px at 76% 42%, color-mix(in srgb, var(--accent) 9%, transparent), transparent 68%),
    linear-gradient(rgba(255,255,255,.017) 1px, transparent 1px) 0 0/58px 58px,
    linear-gradient(90deg, rgba(255,255,255,.017) 1px, transparent 1px) 0 0/58px 58px;
  -webkit-mask-image:radial-gradient(120% 90% at 50% 40%, #000 40%, transparent 100%);
  mask-image:radial-gradient(120% 90% at 50% 40%, #000 40%, transparent 100%) }
.rl .hero .wrap{ position:relative; z-index:2; display:grid;
  grid-template-columns:1.08fr .92fr; gap:56px; align-items:center }
.rl .hero-copy{ display:flex; flex-direction:column; gap:26px; max-width:640px }
.rl h1{ margin:0; font-size:clamp(40px, 6.2vw, 84px); font-weight:700; line-height:.94;
  letter-spacing:-.045em; text-transform:uppercase; text-wrap:balance }
.rl h1 em{ font-style:normal; color:var(--accent); display:block }
.rl .hero-acts{ display:flex; gap:12px; flex-wrap:wrap; align-items:center }
.rl .since{ font-family:var(--mono); font-size:10.5px; color:var(--dim); letter-spacing:.1em }
.rl .strong{ color:var(--text); font-weight:600 }

.rl .hero-orb{ position:relative; aspect-ratio:1; width:100%; max-width:400px;
  margin-left:auto; opacity:.5 }
.rl .o-ring{ position:absolute; inset:0; border-radius:50%; border:1px solid var(--ring) }
.rl .o-ring.o-2{ inset:16%; opacity:.75 }
.rl .o-ring.o-3{ inset:33%; opacity:.55 }
.rl .hero-core{ position:absolute; left:50%; top:50%; width:42px; height:42px;
  translate:-50% -50%; border-radius:50%; background:var(--accent); filter:blur(1px);
  animation:rlBreathe 3.6s ease-in-out infinite }
@keyframes rlBreathe{ 0%,100%{opacity:.72; transform:scale(1)} 50%{opacity:1; transform:scale(1.08)} }
/* satélites: cada um é uma haste invisível girando em torno do centro, com o
   ponto na ponta. Evita calcular seno/cosseno em JS só para um enfeite. */
.rl .hero-spin{ position:absolute; inset:0; animation:rlOrbit 46s linear infinite }
@keyframes rlOrbit{ to{ transform:rotate(360deg) } }
.rl .hero-sat{ position:absolute; left:50%; top:8%; width:7px; height:42%;
  margin-left:-3.5px; transform-origin:50% 100% }
.rl .hero-sat::before{ content:''; display:block; width:7px; height:7px;
  border-radius:50%; background:var(--text); opacity:.5 }

.rl .scrollcue{ position:absolute; left:50%; bottom:26px; translate:-50% 0; z-index:2;
  font-family:var(--mono); font-size:9.5px; letter-spacing:.22em; color:var(--dim);
  text-transform:uppercase; display:flex; flex-direction:column; align-items:center; gap:9px }
.rl .scrollcue i{ display:block; width:1px; height:34px;
  background:linear-gradient(var(--accent), transparent); animation:rlDrop 2.1s ease-in-out infinite }
@keyframes rlDrop{
  0%{opacity:0; transform:scaleY(.2); transform-origin:top}
  40%{opacity:1; transform:scaleY(1); transform-origin:top}
  100%{opacity:0; transform:scaleY(1); transform-origin:bottom} }

/* ── ato orbital: zoom in · gira · zoom out ────────────────────────────── */
.rl .act{ position:relative; height:380vh }
.rl .stage{ position:sticky; top:0; height:100svh; overflow:hidden;
  display:flex; flex-direction:column; align-items:center;
  padding:calc(62px + 3.5vh) 0 3vh }
.rl .stage-bg{ position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(760px 560px at 50% 50%, color-mix(in srgb, var(--accent) 7%, transparent), transparent 70%);
  opacity:var(--bgFade, 0) }

/* o título ocupa a sua própria faixa do flex — nunca sobrepõe a órbita */
.rl .act-title{ position:relative; z-index:3; flex-shrink:0; text-align:center;
  pointer-events:none; display:flex; flex-direction:column; align-items:center; gap:11px;
  opacity:var(--titleIn, 0);
  transform:translateY(calc((1 - var(--titleIn,0)) * 18px)) }
.rl .act-title h2{ margin:0; font-size:clamp(23px, 3vw, 38px); font-weight:700;
  letter-spacing:-.035em; text-transform:uppercase; line-height:1.04 }
.rl .act-title p{ margin:0; font-family:var(--mono); font-size:10.5px; letter-spacing:.18em;
  text-transform:uppercase; color:var(--dim) }

/* a faixa da órbita: centralizada; desloca para a esquerda quando o painel abre */
.rl .orb-row{ position:relative; z-index:2; flex:1; width:100%; min-height:0;
  display:flex; align-items:center; justify-content:center }
.rl .orb{ position:relative; flex-shrink:0;
  width:min(430px, 48vh, 62vw); aspect-ratio:1;
  transform:translateX(var(--orbX, 0px)) scale(var(--zoom, .3));
  opacity:var(--orbIn, 1); will-change:transform;
  transition:none }
/* Só o anel de dentro. O externo passava rente aos nós e engrossava a imagem —
   sem ele os módulos ficam soltos no escuro e o miolo respira. */
.rl .orb .o-ring.o-2{ inset:14%; border-color:var(--ring); opacity:.85 }
.rl .tick{ position:absolute; inset:14%; border-radius:50%;
  background:conic-gradient(from 0deg, var(--ring) 0 .6deg, transparent .6deg 15deg);
  -webkit-mask:radial-gradient(circle, transparent 47.4%, #000 47.6%, #000 50%, transparent 50.2%);
  mask:radial-gradient(circle, transparent 47.4%, #000 47.6%, #000 50%, transparent 50.2%);
  opacity:.75; animation:rlTick 120s linear infinite reverse }
@keyframes rlTick{ to{ transform:rotate(360deg) } }

/* varredura de radar — o gesto do próprio produto, não enfeite genérico */
.rl .sweep{ position:absolute; inset:0; border-radius:50%; pointer-events:none; z-index:0;
  background:conic-gradient(from 0deg,
    color-mix(in srgb, var(--accent) 24%, transparent) 0deg,
    color-mix(in srgb, var(--accent) 5%, transparent) 26deg,
    transparent 52deg);
  -webkit-mask:radial-gradient(circle, transparent 10%, #000 26%, #000 35%, transparent 36%);
  mask:radial-gradient(circle, transparent 10%, #000 26%, #000 35%, transparent 36%);
  opacity:var(--sweepIn, 0); transition:opacity .45s;
  animation:rlSweep 6.5s linear infinite }
@keyframes rlSweep{ to{ transform:rotate(360deg) } }

/* raios do núcleo até cada módulo */
.rl .spokes{ position:absolute; inset:0; z-index:1; overflow:visible; pointer-events:none }
.rl .spokes line{ stroke:var(--line-hi); stroke-width:1; vector-effect:non-scaling-stroke }
.rl .spokes line[data-on="1"]{ stroke:var(--accent); stroke-width:1.6 }
.rl .spokes circle{ fill:var(--accent) }

.rl .core{ position:absolute; left:50%; top:50%; width:62px; height:62px; translate:-50% -50%;
  border-radius:50%; display:grid; place-items:center; z-index:5;
  background:radial-gradient(circle at 34% 30%, color-mix(in srgb, var(--accent) 92%, #fff), var(--accent) 62%, var(--accent-2));
  box-shadow:0 0 44px color-mix(in srgb, var(--accent) 40%, transparent) }
.rl .core::after{ content:''; position:absolute; inset:-14px; border-radius:50%;
  border:1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  animation:rlPing 2.6s cubic-bezier(0,0,.2,1) infinite }
@keyframes rlPing{ 70%,100%{ transform:scale(1.85); opacity:0 } }
.rl .core b{ font-family:var(--mono); font-size:15px; font-weight:700; color:var(--ink) }

.rl .node{ position:absolute; left:50%; top:50%; z-index:10;
  translate:calc(var(--x) * 1px - 50%) calc(var(--y) * 1px - 50%);
  opacity:var(--o, 1); cursor:pointer;
  display:flex; flex-direction:column; align-items:center; gap:9px }
.rl .node[data-soon="1"]{ cursor:default }
.rl .node-d{ position:relative; width:46px; height:46px; border-radius:50%;
  display:grid; place-items:center; background:var(--bg2);
  border:1.5px solid var(--line-hi); color:var(--muted);
  transition:transform .3s cubic-bezier(.2,.8,.2,1), background .25s, color .25s,
             border-color .25s, box-shadow .25s }
.rl .node:hover .node-d{ border-color:var(--accent); color:var(--accent) }
.rl .node[data-open="1"] .node-d{ background:var(--accent); color:var(--ink);
  border-color:var(--accent); transform:scale(1.26);
  box-shadow:0 0 32px color-mix(in srgb, var(--accent) 45%, transparent) }
.rl .node[data-rel="1"] .node-d{ border-color:var(--accent); color:var(--accent);
  background:color-mix(in srgb, var(--accent) 14%, var(--bg2)) }
.rl .node-t{ font-family:var(--mono); font-size:10px; letter-spacing:.14em;
  text-transform:uppercase; color:var(--muted); white-space:nowrap;
  transition:color .25s, transform .25s }
.rl .node[data-open="1"] .node-t{ color:var(--text); transform:scale(1.08) }
/* centralizado acima do disco: encostado à direita, o selo batia no rótulo do
   módulo vizinho quando a órbita girava */
.rl .node-soon{ position:absolute; top:-13px; left:50%; transform:translateX(-50%);
  font-family:var(--mono); font-size:7.5px; letter-spacing:.1em; padding:1px 5px;
  white-space:nowrap; background:var(--bg); border:1px solid var(--line-hi); color:var(--dim) }

.rl .hint{ position:relative; z-index:3; flex-shrink:0; text-align:center;
  font-family:var(--mono); font-size:10px; letter-spacing:.2em; text-transform:uppercase;
  color:var(--dim); pointer-events:none; opacity:var(--hintIn, 0); transition:opacity .4s }

/* painel do módulo — AO LADO da órbita, nunca por cima dela */
.rl .detail{ position:relative; z-index:20; flex-shrink:0; width:min(360px, 34vw);
  margin-left:34px; background:var(--surface); border:1px solid var(--line-hi);
  padding:20px 22px; display:flex; flex-direction:column; gap:13px;
  max-height:calc(100svh - 240px); overflow-y:auto;
  animation:rlCardIn .34s cubic-bezier(.2,.8,.2,1) }
@keyframes rlCardIn{ from{ opacity:0; transform:translateX(-14px) } }
.rl .detail::before{ content:''; position:absolute; left:-34px; top:50%; width:34px; height:1px;
  background:linear-gradient(90deg, transparent, var(--accent)) }
.rl .d-head{ display:flex; align-items:center; justify-content:space-between; gap:10px }
.rl .pill{ font-family:var(--mono); font-size:8.5px; font-weight:700; letter-spacing:.14em;
  text-transform:uppercase; padding:4px 8px }
.rl .pill.on{ background:var(--accent); color:var(--ink) }
.rl .pill.soon{ background:transparent; border:1px solid var(--line-hi); color:var(--dim) }
.rl .d-mode{ font-family:var(--mono); font-size:9px; color:var(--dim); letter-spacing:.09em;
  text-align:right }
.rl .detail h3{ margin:0; font-size:19px; font-weight:700; letter-spacing:-.02em }
.rl .detail p{ margin:0; font-size:12.5px; line-height:1.6; color:var(--muted) }
.rl .d-sec{ font-family:var(--mono); font-size:8.5px; letter-spacing:.18em; color:var(--dim);
  text-transform:uppercase; padding-top:12px; border-top:1px solid var(--line) }
.rl .d-chips{ display:flex; flex-wrap:wrap; gap:5px }
.rl .d-chip{ font-family:var(--mono); font-size:9.5px; color:var(--muted);
  border:1px solid var(--line); padding:3px 7px }
.rl .d-links{ display:flex; flex-wrap:wrap; gap:6px }
.rl .d-link{ font-family:var(--mono); font-size:9.5px; letter-spacing:.06em; color:var(--muted);
  border:1px solid var(--line-hi); padding:5px 9px; display:inline-flex; align-items:center;
  gap:5px; transition:background .15s, color .15s, border-color .15s }
.rl .d-link:hover{ background:var(--accent); color:var(--ink); border-color:var(--accent) }
.rl .d-close{ position:absolute; top:10px; right:11px; width:24px; height:24px;
  display:grid; place-items:center; color:var(--dim) }
.rl .d-close:hover{ color:var(--text); background:var(--raised) }

/* ── revelação ao entrar na viewport ─────────────────────────────────────
   A direção vem de data-rv. Variar impede a página de virar uma esteira só:
   sequência sobe, os dois lados de um argumento entram de fora para dentro,
   destaque cresce. */
.rl .rv{ opacity:0;
  transition:opacity .8s cubic-bezier(.2,.8,.2,1), transform .8s cubic-bezier(.2,.8,.2,1) }
.rl .rv[data-rv="up"]{ transform:translateY(26px) }
.rl .rv[data-rv="down"]{ transform:translateY(-26px) }
.rl .rv[data-rv="left"]{ transform:translateX(-36px) }
.rl .rv[data-rv="right"]{ transform:translateX(36px) }
.rl .rv[data-rv="scale"]{ transform:scale(.955) }
.rl .rv[data-in="1"]{ opacity:1; transform:none }

/* ── seções ────────────────────────────────────────────────────────────── */
.rl .blk{ padding:clamp(80px, 11vh, 140px) 0; position:relative }
.rl .blk-head{ display:flex; flex-direction:column; gap:18px; margin-bottom:52px }
.rl h2.sec{ margin:0; font-size:clamp(28px, 3.8vw, 50px); font-weight:700;
  letter-spacing:-.04em; line-height:1.03; text-transform:uppercase; text-wrap:balance;
  max-width:19ch }
.rl h2.sec em{ font-style:normal; color:var(--accent) }

/* contraste: coluna da direita é um bloco sólido de cor (padrão motion.dev) */
.rl .contrast{ display:grid; grid-template-columns:1fr 1fr; border:1px solid var(--line) }
.rl .cx{ padding:34px 32px; display:flex; flex-direction:column; gap:16px; min-height:300px }
.rl .cx h3{ margin:0; font-size:23px; font-weight:700; letter-spacing:-.02em; line-height:1.12 }
.rl .cx p{ margin:0; font-size:13.5px; line-height:1.65 }
.rl .cx-l{ font-family:var(--mono); font-size:10px; letter-spacing:.2em; text-transform:uppercase }
/* Antes a coluna "Rift" era um bloco sólido de cor. Era forte demais: puxava
   toda a atenção da página e brigava com o hero. Agora as duas colunas são
   escuras e a diferença vem do acento em detalhe — filete lateral, rótulo e
   barras — o que também deixa o texto legível em qualquer tom. */
.rl .cx.bad{ background:var(--bg2) }
.rl .cx.bad .cx-l{ color:#F04452 }
.rl .cx.bad p{ color:var(--muted) }
.rl .cx.good{ background:var(--surface); box-shadow:inset 3px 0 0 var(--accent) }
.rl .cx.good .cx-l{ color:var(--accent) }
.rl .cx.good h3{ color:var(--text) }
.rl .cx.good p{ color:var(--muted) }
.rl .stack{ display:flex; flex-direction:column; gap:6px; margin-top:auto;
  font-family:var(--mono); font-size:11px }
.rl .stack .r{ display:flex; align-items:center; gap:9px }
.rl .stack .r b{ font-weight:700; min-width:30px; text-align:right;
  font-variant-numeric:tabular-nums }
/* alpha no track via color-mix, não via opacity — opacity no pai limitaria o filho */
.rl .stack .r .b{ flex:1; height:3px;
  background:color-mix(in srgb, currentColor 22%, transparent) }
.rl .stack .r .b i{ display:block; height:100%; width:0; background:currentColor;
  transition:width 1.1s cubic-bezier(.2,.8,.2,1) }
.rl .cx.bad .stack{ color:#F04452 }
.rl .cx.good .stack{ color:var(--accent) }
.rl .note{ font-family:var(--mono); font-size:10.5px; color:var(--dim);
  margin:14px 0 0; letter-spacing:.05em }

/* fluxo numerado — aqui a numeração é verdade: é uma sequência */
.rl .flow{ display:grid; grid-template-columns:repeat(3, 1fr);
  border-top:1px solid var(--line); border-left:1px solid var(--line) }
.rl .step{ padding:28px 26px 32px; border-right:1px solid var(--line);
  border-bottom:1px solid var(--line); display:flex; flex-direction:column; gap:12px;
  transition:background .2s }
.rl .step:hover{ background:var(--surface) }
.rl .step-n{ font-family:var(--mono); font-size:11px; letter-spacing:.16em; color:var(--accent) }
.rl .step h3{ margin:0; font-size:16.5px; font-weight:700; letter-spacing:-.01em }
.rl .step p{ margin:0; font-size:13px; line-height:1.6; color:var(--muted) }
/* a etapa 04 é o coração do produto — marcada por filete e fundo elevado,
   não por bloco sólido de cor */
.rl .step.hi{ background:var(--surface); box-shadow:inset 0 -2px 0 var(--accent) }
.rl .step.hi:hover{ background:var(--raised) }

/* entregáveis — chip preto com o glifo no acento. As três cores distintas
   (ciano/rosa) foram removidas: competiam com o acento em vez de acompanhar. */
.rl .deliv{ display:grid; grid-template-columns:repeat(3, 1fr); gap:1px; background:var(--line);
  border:1px solid var(--line) }
.rl .dl{ background:var(--bg); padding:30px 28px; display:flex; flex-direction:column; gap:14px }
.rl .dl-i{ width:40px; height:40px; display:grid; place-items:center; color:var(--accent);
  background:var(--surface); border:1px solid var(--line-hi) }
.rl .dl h3{ margin:0; font-size:16px; font-weight:700 }
.rl .dl p{ margin:0; font-size:13px; line-height:1.62; color:var(--muted) }

.rl .rules{ display:flex; flex-direction:column; border-top:1px solid var(--line);
  margin:58px 0 0 }
.rl .rule{ display:grid; grid-template-columns:190px 1fr; gap:26px; padding:22px 4px;
  border-bottom:1px solid var(--line); align-items:baseline }
.rl .rule dt{ font-family:var(--mono); font-size:10.5px; letter-spacing:.16em;
  text-transform:uppercase; color:var(--accent) }
.rl .rule dd{ margin:0; font-size:14px; line-height:1.65; color:var(--muted) }
.rl .rule dd b{ color:var(--text); font-weight:600 }

/* cta */
.rl .cta{ text-align:center; padding:clamp(90px,13vh,160px) 0; position:relative;
  overflow:hidden; border-top:1px solid var(--line) }
.rl .cta-bg{ position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(620px 400px at 50% 55%, color-mix(in srgb, var(--accent) 13%, transparent), transparent 72%) }
.rl .cta .wrap{ position:relative; display:flex; flex-direction:column; align-items:center; gap:24px }
.rl .cta h2{ margin:0; font-size:clamp(30px, 4.6vw, 60px); font-weight:700;
  letter-spacing:-.04em; text-transform:uppercase; line-height:1.02; text-wrap:balance }

.rl footer{ border-top:1px solid var(--line); padding:34px 0 48px }
.rl .foot-top{ display:flex; align-items:center; gap:26px; flex-wrap:wrap;
  font-family:var(--mono); font-size:10px; letter-spacing:.12em; color:var(--dim);
  text-transform:uppercase }
.rl .foot-brand{ display:flex; align-items:center; gap:10px }
.rl .foot-brand .mark-g{ width:22px; height:22px; font-size:11px }
.rl .foot-nav{ display:flex; gap:18px; flex-wrap:wrap }
.rl .foot-nav a{ transition:color .15s }
.rl .foot-nav a:hover{ color:var(--text) }
.rl .foot-note{ margin-left:auto }

/* ── páginas internas ──────────────────────────────────────────────────── */
.rl .page{ padding:calc(62px + clamp(46px,7vh,84px)) 0 0 }
.rl .page-head{ display:flex; flex-direction:column; gap:18px; margin-bottom:14px }
.rl .page-h1{ margin:0; font-size:clamp(32px, 4.6vw, 60px); font-weight:700;
  letter-spacing:-.042em; line-height:1.02; text-transform:uppercase; text-wrap:balance;
  max-width:20ch }
.rl .page-h1 em{ font-style:normal; color:var(--accent) }

/* cartões que levam a outra página */
.rl .navcards{ display:grid; grid-template-columns:repeat(3, 1fr); gap:1px;
  background:var(--line); border:1px solid var(--line) }
.rl .navcard{ background:var(--bg); padding:26px 24px 22px; display:flex;
  flex-direction:column; gap:9px; transition:background .16s }
.rl .navcard:hover{ background:var(--surface) }
.rl .navcard-k{ font-family:var(--mono); font-size:9.5px; letter-spacing:.18em;
  text-transform:uppercase; color:var(--dim) }
.rl .navcard-t{ font-size:18px; font-weight:700; letter-spacing:-.02em }
.rl .navcard-b{ font-size:13px; line-height:1.6; color:var(--muted) }
.rl .navcard-go{ margin-top:6px; display:inline-flex; align-items:center; gap:6px;
  font-family:var(--mono); font-size:10px; letter-spacing:.14em; text-transform:uppercase;
  color:var(--accent) }

/* grade de módulos (índice) */
.rl .modgrid{ display:grid; grid-template-columns:repeat(3, 1fr); gap:1px;
  background:var(--line); border:1px solid var(--line) }
.rl .modcard{ background:var(--bg); padding:26px 24px; display:flex; flex-direction:column;
  gap:12px; transition:background .16s }
.rl .modcard:hover{ background:var(--surface) }
.rl .modcard-top{ display:flex; align-items:center; gap:12px }
.rl .modcard-i{ width:40px; height:40px; flex-shrink:0; display:grid; place-items:center;
  background:var(--surface); border:1px solid var(--line-hi); color:var(--accent) }
.rl .modcard h3{ margin:0; font-size:17px; font-weight:700; letter-spacing:-.015em }
.rl .modcard p{ margin:0; font-size:13px; line-height:1.6; color:var(--muted) }
.rl .modcard-m{ font-family:var(--mono); font-size:9.5px; letter-spacing:.08em;
  color:var(--dim) }

/* passos numerados de "como opera" */
.rl .howlist{ display:flex; flex-direction:column; border-top:1px solid var(--line) }
.rl .howrow{ display:grid; grid-template-columns:56px 1fr; gap:20px; padding:20px 4px;
  border-bottom:1px solid var(--line); align-items:baseline }
.rl .howrow b{ font-family:var(--mono); font-size:11px; letter-spacing:.14em;
  color:var(--accent); font-weight:700 }
.rl .howrow span{ font-size:14.5px; line-height:1.6; color:var(--muted) }

/* colunas de detalhe (o que cobre / o que precisamos) */
.rl .twocol{ display:grid; grid-template-columns:1fr 1fr; gap:1px;
  background:var(--line); border:1px solid var(--line) }
.rl .col{ background:var(--bg); padding:26px 24px; display:flex; flex-direction:column; gap:14px }
.rl .col ul{ margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:9px }
.rl .col li{ font-size:13.5px; line-height:1.5; color:var(--muted); display:flex; gap:10px }
.rl .col li::before{ content:''; flex-shrink:0; width:5px; height:5px; margin-top:7px;
  background:var(--accent) }

.rl .prose{ display:flex; flex-direction:column; gap:15px; max-width:68ch }
.rl .prose p{ margin:0; font-size:14.5px; line-height:1.72; color:var(--muted) }
.rl .prose p b{ color:var(--text); font-weight:600 }

/* ── seletor de tom (temporário: validação dos 3 tons) ─────────────────── */
.rl .tomsel{ position:fixed; right:18px; bottom:18px; z-index:90; display:flex;
  align-items:center; gap:9px; padding:8px 11px;
  background:color-mix(in srgb, var(--surface) 92%, transparent); backdrop-filter:blur(12px);
  border:1px solid var(--line-hi) }
.rl .tomsel span{ font-family:var(--mono); font-size:8.5px; letter-spacing:.16em;
  color:var(--dim); text-transform:uppercase }
.rl .tomsel button{ width:22px; height:22px; border-radius:50%; border:2px solid transparent;
  transition:transform .15s, border-color .15s }
.rl .tomsel button:hover{ transform:scale(1.14) }
.rl .tomsel button[aria-pressed="true"]{ border-color:var(--text) }

/* ── responsivo ────────────────────────────────────────────────────────── */
@media (max-width:1000px){
  .rl .nav-menus{ display:none }
  .rl .burger{ display:grid }
  .rl .nav-panel{ display:none }
  .rl .nav-row{ justify-content:space-between }
  .rl .navcards, .rl .modgrid, .rl .twocol{ grid-template-columns:1fr }
}
@media (max-width:900px){
  .rl .intro-grid{ grid-template-columns:1fr; gap:34px }
  .rl .scanhero{ height:240vh }
  .rl .scanhero-h1{ letter-spacing:-.04em }
  .rl .scanhero-sub{ letter-spacing:.22em; max-width:24ch }
  .rl .foot-note{ margin-left:0 }
  .rl .howrow{ grid-template-columns:44px 1fr; gap:14px }
  .rl .hero .wrap{ grid-template-columns:1fr; gap:38px }
  .rl .hero-orb{ display:none }
  .rl .contrast, .rl .flow, .rl .deliv{ grid-template-columns:1fr }
  .rl .rule{ grid-template-columns:1fr; gap:8px }
  .rl .act{ height:300vh }
  .rl .orb{ width:min(340px, 42vh, 76vw) }
  .rl .act-title h2{ font-size:clamp(20px, 5.4vw, 28px) }
  /* painel embaixo da órbita quando não há espaço lateral */
  .rl .orb-row{ flex-direction:column; justify-content:flex-start; gap:14px; overflow-y:auto }
  .rl .detail{ width:min(360px, 88vw); margin:0; max-height:none }
  .rl .detail::before{ display:none }
}
@media (max-width:700px){
  .rl .btn.hide-sm{ display:none }
}
@media (max-width:460px){
  .rl .btn.hide-xs{ display:none }
}
@media (prefers-reduced-motion:reduce){
  .rl *{ animation:none !important }
  .rl .rv{ opacity:1; transform:none }
  .rl .orb{ transform:none !important }
}
`}</style>
  )
}
