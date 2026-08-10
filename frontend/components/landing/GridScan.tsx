'use client'
import { useEffect, useRef } from 'react'

/**
 * Túnel infinito com varredura — o fundo do primeiro bloco da home.
 *
 * O shader é o do GridScan do React Bits, portado. O componente original
 * carrega three.js + postprocessing + face-api.js (rastreio de rosto pela
 * webcam) só para desenhar um quad de tela cheia — três dependências pesadas e
 * um pedido de permissão de câmera numa página de vendas. Aqui é WebGL cru:
 * um quad, um fragment shader, zero dependência nova.
 *
 * O que foi ACRESCENTADO ao shader original — o mergulho:
 *
 *   `uZoom`  distância percorrida no corredor. O valor entra em `mod()` antes de
 *            virar posição de câmera: o túnel é periódico, então avançar 60
 *            unidades ou 60 mod 12 gera a MESMA imagem — e o wrap mantém a
 *            precisão de `fract()` intacta, que é o que estoura em float32
 *            quando as coordenadas de grade passam da casa dos milhares.
 *   `uSpeed` derrete os pontos em linha contínua conforme acelera. É o rastro:
 *            sem ele, avançar num túnel auto-similar quase não parece movimento.
 *   `uFlash` o estouro de luz quando a varredura ultrapassa a câmera — o momento
 *            de "atravessar" que separa a abertura do conteúdo.
 *
 * A varredura acompanha a câmera (`scanZ` soma `ro.z`), senão ficaria para trás
 * no primeiro passo do mergulho.
 */

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

const FRAG = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform vec3 iResolution;
uniform float iTime;
uniform float uLineThickness;
uniform vec3 uLinesColor;
uniform vec3 uScanColor;
uniform float uGridScale;
uniform float uLineStyle;
uniform float uLineJitter;
uniform float uScanOpacity;
uniform float uScanDirection;
uniform float uNoise;
uniform float uScanGlow;
uniform float uScanSoftness;
uniform float uPhaseTaper;
uniform float uScanDuration;
uniform float uScanDelay;
uniform float uScanStarts[8];
uniform float uScanCount;
uniform float uZoom;
uniform float uSpeed;
uniform float uFlash;
varying vec2 vUv;

const int MAX_SCANS = 8;

float smoother01(float a, float b, float x){
  float t = clamp((x - a) / max(1e-5, (b - a)), 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 p = (2.0 * fragCoord - iResolution.xy) / iResolution.y;

  float gridScale0 = max(1e-5, uGridScale);
  // 62 unidades = ~2000 células de grade. O mod mantém a imagem idêntica (o
  // túnel é periódico) sem estourar a precisão de fract() lá na frente.
  float zTravel = mod(uZoom * 62.0, gridScale0 * 12.0);
  vec3 ro = vec3(0.0, 0.0, zTravel);
  // a lente abre de 2.0 para 0.62: é a "punhalada" de grande-angular que faz o
  // corredor parecer que engole a tela
  vec3 rd = normalize(vec3(p, mix(2.0, 0.62, clamp(uZoom, 0.0, 1.0))));

  vec3 color = vec3(0.0);
  float minT = 1e20;
  float gridScale = max(1e-5, uGridScale);
  float fadeStrength = 2.0;
  vec2 gridUV = vec2(0.0);
  float hitIsY = 1.0;

  for (int i = 0; i < 4; i++){
    float isY = float(i < 2);
    float pos = mix(-0.2, 0.2, float(i)) * isY + mix(-0.5, 0.5, float(i - 2)) * (1.0 - isY);
    float num = pos - (isY * ro.y + (1.0 - isY) * ro.x);
    float den = isY * rd.y + (1.0 - isY) * rd.x;
    float t = num / den;
    vec3 h = ro + rd * t;
    bool use = t > 0.0 && t < minT;
    gridUV = use ? mix(h.zy, h.xz, isY) / gridScale : gridUV;
    minT = use ? t : minT;
    hitIsY = use ? isY : hitIsY;
  }

  vec3 hit = ro + rd * minT;
  float dist = length(hit - ro);

  float jitterAmt = clamp(uLineJitter, 0.0, 1.0);
  if (jitterAmt > 0.0) {
    gridUV += vec2(sin(gridUV.y * 2.7 + iTime * 1.8), cos(gridUV.x * 2.3 - iTime * 1.6)) * (0.15 * jitterAmt);
  }
  float fx = fract(gridUV.x), fy = fract(gridUV.y);
  float ax = min(fx, 1.0 - fx), ay = min(fy, 1.0 - fy);
  float wx = fwidth(gridUV.x), wy = fwidth(gridUV.y);
  float halfPx = max(0.0, uLineThickness) * 0.5;
  float tx = halfPx * wx, ty = halfPx * wy;
  float lineX = 1.0 - smoothstep(tx, tx + wx, ax);
  float lineY = 1.0 - smoothstep(ty, ty + wy, ay);
  float lineXRaw = lineX;   // antes do recorte pontilhado — o alvo do rastro
  float lineYRaw = lineY;
  if (uLineStyle > 0.5) {
    float vy = fract(gridUV.y * 4.0), vx = fract(gridUV.x * 4.0);
    if (uLineStyle < 1.5) {
      lineX *= step(vy, 0.5);
      lineY *= step(vx, 0.5);
    } else {
      float cy = abs(fract(gridUV.y * 6.0) - 0.5);
      float cx = abs(fract(gridUV.x * 6.0) - 0.5);
      lineX *= 1.0 - smoothstep(0.18, 0.18 + fwidth(gridUV.y * 6.0), cy);
      lineY *= 1.0 - smoothstep(0.18, 0.18 + fwidth(gridUV.x * 6.0), cx);
    }
  }
  // RASTRO: com velocidade, o recorte de pontos/traços derrete em linha cheia.
  // É o que transforma "grade mais densa" em "estou voando por dentro disto".
  float trail = clamp(uSpeed, 0.0, 1.0);
  lineX = mix(lineX, max(lineX, lineXRaw), trail);
  lineY = mix(lineY, max(lineY, lineYRaw), trail);

  float primaryMask = max(lineX, lineY);

  vec2 gridUV2 = (hitIsY > 0.5 ? hit.xz : hit.zy) / gridScale;
  if (jitterAmt > 0.0) {
    gridUV2 += vec2(cos(gridUV2.y * 2.1 - iTime * 1.4), sin(gridUV2.x * 2.5 + iTime * 1.7)) * (0.15 * jitterAmt);
  }
  float ax2 = min(fract(gridUV2.x), 1.0 - fract(gridUV2.x));
  float ay2 = min(fract(gridUV2.y), 1.0 - fract(gridUV2.y));
  float wx2 = fwidth(gridUV2.x), wy2 = fwidth(gridUV2.y);
  float lineX2 = 1.0 - smoothstep(halfPx * wx2, halfPx * wx2 + wx2, ax2);
  float lineY2 = 1.0 - smoothstep(halfPx * wy2, halfPx * wy2 + wy2, ay2);
  if (uLineStyle > 0.5) {
    if (uLineStyle < 1.5) {
      lineX2 *= step(fract(gridUV2.y * 4.0), 0.5);
      lineY2 *= step(fract(gridUV2.x * 4.0), 0.5);
    } else {
      float cy2 = abs(fract(gridUV2.y * 6.0) - 0.5);
      float cx2 = abs(fract(gridUV2.x * 6.0) - 0.5);
      lineX2 *= 1.0 - smoothstep(0.18, 0.18 + fwidth(gridUV2.y * 6.0), cy2);
      lineY2 *= 1.0 - smoothstep(0.18, 0.18 + fwidth(gridUV2.x * 6.0), cx2);
    }
  }
  float altMask = max(lineX2, lineY2);

  float edgeDistX = min(abs(hit.x + 0.5), abs(hit.x - 0.5));
  float edgeDistY = min(abs(hit.y + 0.2), abs(hit.y - 0.2));
  float edgeDist = mix(edgeDistY, edgeDistX, hitIsY);
  altMask *= 1.0 - smoothstep(gridScale * 0.5, gridScale * 2.0, edgeDist);

  float lineMask = max(primaryMask, altMask);
  float fade = exp(-dist * fadeStrength);

  float dur = max(0.05, uScanDuration);
  float del = max(0.0, uScanDelay);
  float widthScale = max(0.1, uScanGlow);
  float sigma = max(0.001, 0.18 * widthScale * uScanSoftness);
  float sigmaA = sigma * 2.0;
  float taper = clamp(uPhaseTaper, 0.0, 0.49);

  float combinedPulse = 0.0;
  float combinedAura = 0.0;

  float tCycle = mod(iTime, dur + del);
  float phase = clamp((tCycle - del) / dur, 0.0, 1.0);
  if (uScanDirection > 0.5 && uScanDirection < 1.5) {
    phase = 1.0 - phase;
  } else if (uScanDirection > 1.5) {
    float t2 = mod(max(0.0, iTime - del), 2.0 * dur);
    phase = (t2 < dur) ? (t2 / dur) : (1.0 - (t2 - dur) / dur);
  }
  // a varredura viaja COM a câmera: sem somar ro.z ela ficaria para trás no mergulho
  float dz = abs(hit.z - (phase * 2.0 + ro.z));
  float phaseWindow = smoother01(0.0, taper, phase) * (1.0 - smoother01(1.0 - taper, 1.0, phase));
  combinedPulse += exp(-0.5 * (dz * dz) / (sigma * sigma)) * phaseWindow * clamp(uScanOpacity, 0.0, 1.0);
  combinedAura += exp(-0.5 * (dz * dz) / (sigmaA * sigmaA)) * 0.25 * phaseWindow * clamp(uScanOpacity, 0.0, 1.0);

  for (int i = 0; i < MAX_SCANS; i++) {
    if (float(i) >= uScanCount) break;
    float phaseI = clamp((iTime - uScanStarts[i]) / dur, 0.0, 1.0);
    if (uScanDirection > 0.5 && uScanDirection < 1.5) {
      phaseI = 1.0 - phaseI;
    } else if (uScanDirection > 1.5) {
      phaseI = (phaseI < 0.5) ? (phaseI * 2.0) : (1.0 - (phaseI - 0.5) * 2.0);
    }
    float dzI = abs(hit.z - (phaseI * 2.0 + ro.z));
    float winI = smoother01(0.0, taper, phaseI) * (1.0 - smoother01(1.0 - taper, 1.0, phaseI));
    combinedPulse += exp(-0.5 * (dzI * dzI) / (sigma * sigma)) * winI * clamp(uScanOpacity, 0.0, 1.0);
    combinedAura += exp(-0.5 * (dzI * dzI) / (sigmaA * sigmaA)) * 0.25 * winI * clamp(uScanOpacity, 0.0, 1.0);
  }

  // as linhas ganham corpo com a velocidade — o corredor "acende" ao acelerar
  vec3 lineCol = mix(uLinesColor, uScanColor, clamp(uSpeed, 0.0, 1.0) * 0.55);
  float gain = 1.0 + clamp(uSpeed, 0.0, 1.0) * 2.2;
  color = lineCol * lineMask * fade * gain + uScanColor * combinedPulse + uScanColor * combinedAura;

  float n = fract(sin(dot(gl_FragCoord.xy + vec2(iTime * 123.4), vec2(12.9898, 78.233))) * 43758.5453123);
  color += (n - 0.5) * uNoise;

  // ESTOURO: a varredura ultrapassa a câmera. Mais forte no centro, onde está o
  // ponto de fuga — a luz vem "de dentro" do túnel, não de cima da tela.
  float center = 1.0 - smoothstep(0.0, 1.6, length(p));
  color += uScanColor * uFlash * (0.35 + center * 0.9);
  color = clamp(color, 0.0, 1.0);

  fragColor = vec4(color, 1.0);
}

void main(){
  vec4 c;
  mainImage(c, vUv * iResolution.xy);
  gl_FragColor = c;
}
`

export type GridScanHandle = {
  /**
   * @param zoom  distância percorrida (0 parado, 1 no fundo do mergulho)
   * @param speed intensidade do rastro e do brilho das linhas
   * @param flash estouro de luz da varredura passando pela câmera
   */
  setDive: (zoom: number, speed: number, flash: number) => void
  /** dispara uma varredura extra (usado no clique) */
  pulse: () => void
}

const MAX_SCANS = 8

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.trim().replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  if (Number.isNaN(n)) return [1, 1, 1]
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function GridScan({ handleRef, linesColor = '#2F293A', scanColor = '#CCFF00' }: {
  /** o pai escreve aqui para dirigir o mergulho a cada frame */
  handleRef: React.MutableRefObject<GridScanHandle | null>
  linesColor?: string
  scanColor?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const colorsRef = useRef({ linesColor, scanColor })
  colorsRef.current = { linesColor, scanColor }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' })
    if (!gl) return
    gl.getExtension('OES_standard_derivatives')

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('[GridScan]', gl.getShaderInfoLog(s))
        return null
      }
      return s
    }
    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) return

    const prog = gl.createProgram()!
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[GridScan]', gl.getProgramInfoLog(prog)); return
    }
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const u = (n: string) => gl.getUniformLocation(prog, n)
    const uRes = u('iResolution'), uTime = u('iTime'), uZoom = u('uZoom')
    const uSpeed = u('uSpeed'), uFlash = u('uFlash')
    const uStarts = u('uScanStarts'), uCount = u('uScanCount')
    const uLines = u('uLinesColor'), uScan = u('uScanColor')

    // parâmetros fixos (os valores validados no Background Studio)
    gl.uniform1f(u('uLineThickness'), 0.5)
    gl.uniform1f(u('uGridScale'), 0.03)
    gl.uniform1f(u('uLineStyle'), 2)        // dotted
    gl.uniform1f(u('uLineJitter'), 0)
    gl.uniform1f(u('uScanOpacity'), 0.15)
    gl.uniform1f(u('uScanDirection'), 0)    // forward
    gl.uniform1f(u('uNoise'), 0.01)
    gl.uniform1f(u('uScanGlow'), 0.3)
    gl.uniform1f(u('uScanSoftness'), 4)
    gl.uniform1f(u('uPhaseTaper'), 0.9)
    gl.uniform1f(u('uScanDuration'), 2)
    gl.uniform1f(u('uScanDelay'), 1.5)

    const starts = new Float32Array(MAX_SCANS)
    let count = 0
    let zoom = 0, speed = 0, flash = 0
    let visible = true
    let raf = 0
    const t0 = performance.now()

    handleRef.current = {
      setDive: (z, s, f) => { zoom = z; speed = s; flash = f },
      pulse: () => {
        const t = (performance.now() - t0) / 1000
        if (count < MAX_SCANS) { starts[count] = t; count++ }
        else { starts.copyWithin(0, 1); starts[MAX_SCANS - 1] = t }
      },
    }

    // DPR limitado: o shader é fill-rate bound e a tela toda a 2x custa caro
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 1.5)
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h
        gl.viewport(0, 0, w, h)
      }
      gl.uniform3f(uRes, canvas.width, canvas.height, 1)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    // não queima GPU com o hero fora da tela — a página é longa
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting }, { threshold: 0 })
    io.observe(canvas)

    let lastLines = '', lastScan = ''
    const frame = () => {
      raf = requestAnimationFrame(frame)
      if (!visible) return
      const { linesColor: lc, scanColor: sc } = colorsRef.current
      if (lc !== lastLines) { gl.uniform3fv(uLines, hexToRgb(lc)); lastLines = lc }
      if (sc !== lastScan) { gl.uniform3fv(uScan, hexToRgb(sc)); lastScan = sc }
      gl.uniform1f(uTime, (performance.now() - t0) / 1000)
      gl.uniform1f(uZoom, zoom)
      gl.uniform1f(uSpeed, speed)
      gl.uniform1f(uFlash, flash)
      gl.uniform1fv(uStarts, starts)
      gl.uniform1f(uCount, count)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect(); io.disconnect()
      handleRef.current = null
      gl.deleteProgram(prog); gl.deleteShader(vs); gl.deleteShader(fs); gl.deleteBuffer(buf)
    }
  }, [handleRef])

  return <canvas ref={canvasRef} className="gs-canvas" aria-hidden="true" />
}
