// BG/NBD (Fader, Hardie & Lee, 2005) y Gamma-Gamma (Fader & Hardie, 2013)

export type Cust = { id: number; x: number; tx: number; T: number; m: number };
export type BgNbd = { r: number; alpha: number; a: number; b: number };
export type GammaGamma = { p: number; q: number; v: number };

// ---------- funciones especiales ----------
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function lgamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - lgamma(1 - z);
  z -= 1;
  let s = LANCZOS[0];
  for (let i = 1; i < 9; i++) s += LANCZOS[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(s);
}

// Función hipergeométrica de Gauss 2F1(A,B;C;z) por serie (converge para 0 <= z < 1)
function hyp2f1(A: number, B: number, C: number, z: number): number {
  let term = 1;
  let sum = 1;
  for (let n = 0; n < 1000; n++) {
    term *= (((A + n) * (B + n)) / ((C + n) * (n + 1))) * z;
    sum += term;
    if (Math.abs(term) < 1e-12 * Math.abs(sum)) break;
  }
  return sum;
}

// ---------- optimizador Nelder-Mead ----------
type Pt = { x: number[]; f: number };

function nelderMead(f: (x: number[]) => number, x0: number[], maxIter: number): Pt {
  const n = x0.length;
  const pts: Pt[] = [{ x: x0.slice(), f: f(x0) }];
  for (let i = 0; i < n; i++) {
    const x = x0.slice();
    x[i] += 0.5;
    pts.push({ x, f: f(x) });
  }

  for (let it = 0; it < maxIter; it++) {
    pts.sort((a, b) => a.f - b.f);
    const best = pts[0];
    const worst = pts[n];
    const second = pts[n - 1];
    if (Math.abs(worst.f - best.f) <= 1e-10 * (1 + Math.abs(best.f))) break;

    const c = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += pts[i].x[j] / n;
    const along = (t: number) => c.map((cj, j) => cj + t * (worst.x[j] - cj));

    const xr = along(-1);
    const fr = f(xr);
    if (fr < best.f) {
      const xe = along(-2);
      const fe = f(xe);
      pts[n] = fe < fr ? { x: xe, f: fe } : { x: xr, f: fr };
    } else if (fr < second.f) {
      pts[n] = { x: xr, f: fr };
    } else {
      const outside = fr < worst.f;
      const xc = outside ? along(-0.5) : along(0.5);
      const fc = f(xc);
      if (fc < (outside ? fr : worst.f)) {
        pts[n] = { x: xc, f: fc };
      } else {
        for (let i = 1; i <= n; i++) {
          const x = pts[i].x.map((v, j) => best.x[j] + 0.5 * (v - best.x[j]));
          pts[i] = { x, f: f(x) };
        }
      }
    }
  }
  pts.sort((a, b) => a.f - b.f);
  return pts[0];
}

// Nelder-Mead puede detenerse antes de tiempo: reiniciamos desde el mejor punto
function minimize(f: (x: number[]) => number, x0: number[], restarts = 3, maxIter = 1500): Pt {
  let best: Pt = { x: x0, f: f(x0) };
  for (let i = 0; i < restarts; i++) {
    const res = nelderMead(f, best.x, maxIter);
    if (res.f < best.f) best = res;
  }
  return best;
}

// ---------- BG/NBD ----------
function bgNbdLogLik([r, alpha, a, b]: number[], data: Cust[]): number {
  const lgR = lgamma(r);
  const lgAB = lgamma(a + b);
  const lgB = lgamma(b);
  let ll = 0;
  for (const { x, tx, T } of data) {
    const A1 = lgamma(r + x) - lgR + r * Math.log(alpha);
    const A2 = lgAB + lgamma(b + x) - lgB - lgamma(a + b + x);
    const A3 = -(r + x) * Math.log(alpha + T);
    if (x > 0) {
      const A4 = Math.log(a) - Math.log(b + x - 1) - (r + x) * Math.log(alpha + tx);
      const mx = Math.max(A3, A4);
      ll += A1 + A2 + mx + Math.log(Math.exp(A3 - mx) + Math.exp(A4 - mx));
    } else {
      ll += A1 + A2 + A3;
    }
  }
  return ll;
}

export function fitBgNbd(data: Cust[]): BgNbd & { nll: number } {
  // optimizamos en escala log para que los 4 parámetros sean siempre positivos
  const f = (th: number[]) => {
    const v = -bgNbdLogLik(th.map(Math.exp), data) / data.length;
    return Number.isFinite(v) ? v : 1e12;
  };
  const best = minimize(f, [0, 0, 0, 0]);
  const [r, alpha, a, b] = best.x.map(Math.exp);
  return { r, alpha, a, b, nll: best.f };
}

// Probabilidad de que el cliente siga "vivo"
export function pAlive(m: BgNbd, { x, tx, T }: Pick<Cust, 'x' | 'tx' | 'T'>): number {
  if (x === 0) return 1;
  const ratio = Math.pow((m.alpha + T) / (m.alpha + tx), m.r + x);
  return 1 / (1 + (m.a / (m.b + x - 1)) * ratio);
}

// Compras esperadas en las próximas t semanas, dado el historial del cliente
export function expectedPurchases(
  m: BgNbd,
  { x, tx, T }: Pick<Cust, 'x' | 'tx' | 'T'>,
  t: number,
): number {
  const { r, alpha, b } = m;
  let a = m.a;
  if (a + b + x - 1 <= 0) throw new Error('Parámetros inválidos: a + b debe ser mayor que 1');
  if (Math.abs(a - 1) < 1e-6) a += 1e-6; // evita la singularidad (removible) en a = 1

  const z = t / (alpha + T + t);
  const hyp = hyp2f1(r + x, b + x, a + b + x - 1, z);
  const first = (a + b + x - 1) / (a - 1);
  const second = 1 - hyp * Math.pow((alpha + T) / (alpha + T + t), r + x);
  const denom =
    1 + (x > 0 ? (a / (b + x - 1)) * Math.pow((alpha + T) / (alpha + tx), r + x) : 0);
  return Math.max(0, (first * second) / denom);
}

// ---------- Gamma-Gamma ----------
export function fitGammaGamma(data: { x: number; m: number }[]): GammaGamma & { nll: number } {
  const meanM = data.reduce((s, d) => s + d.m, 0) / data.length;
  const f = (th: number[]) => {
    const p = Math.exp(th[0]);
    const q = 1 + Math.exp(th[1]); // q > 1 para que la media poblacional exista
    const v = Math.exp(th[2]);
    let s = 0;
    for (const { x, m } of data) {
      s +=
        lgamma(p * x + q) - lgamma(p * x) - lgamma(q) +
        q * Math.log(v) +
        (p * x - 1) * Math.log(m) +
        p * x * Math.log(x) -
        (p * x + q) * Math.log(x * m + v);
    }
    const val = -s / data.length;
    return Number.isFinite(val) ? val : 1e12;
  };
  const best = minimize(f, [0, 0, Math.log(meanM)]);
  return {
    p: Math.exp(best.x[0]),
    q: 1 + Math.exp(best.x[1]),
    v: Math.exp(best.x[2]),
    nll: best.f,
  };
}

// Valor esperado por compra: mezcla entre la media poblacional y lo observado
export function expectedAvgValue(g: GammaGamma, x: number, m: number): number {
  const w = (g.p * x) / (g.p * x + g.q - 1);
  const popMean = (g.v * g.p) / (g.q - 1);
  return (1 - w) * popMean + w * m;
}
