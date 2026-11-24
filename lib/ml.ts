// Solución de sistemas lineales (eliminación gaussiana con pivoteo parcial)
export function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const piv = M[c][c];
    if (Math.abs(piv) < 1e-12) throw new Error('Matriz singular');
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / piv;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let k = i + 1; k < n; k++) s -= M[i][k] * x[k];
    x[i] = s / M[i][i];
  }
  return x;
}

// Regresión logística con L2 por IRLS (Newton). Devuelve [intercepto, ...pesos].
// El intercepto no se penaliza. Se asume X ya estandarizado.
export function fitLogistic(X: number[][], y: number[], lambda = 1, maxIter = 50): number[] {
  const n = X.length;
  const d = X[0].length + 1;
  const w = new Array(d).fill(0);

  for (let it = 0; it < maxIter; it++) {
    const H = Array.from({ length: d }, () => new Array(d).fill(0));
    const g = new Array(d).fill(0);

    for (let i = 0; i < n; i++) {
      const xi = [1, ...X[i]];
      let z = 0;
      for (let j = 0; j < d; j++) z += w[j] * xi[j];
      const p = 1 / (1 + Math.exp(-z));
      const s = Math.max(p * (1 - p), 1e-9);
      const r = y[i] - p;
      for (let j = 0; j < d; j++) {
        g[j] += r * xi[j];
        for (let k = j; k < d; k++) H[j][k] += s * xi[j] * xi[k];
      }
    }
    for (let j = 0; j < d; j++) for (let k = 0; k < j; k++) H[j][k] = H[k][j];
    for (let j = 1; j < d; j++) {
      H[j][j] += lambda;
      g[j] -= lambda * w[j];
    }

    const step = solve(H, g);
    let maxStep = 0;
    for (let j = 0; j < d; j++) {
      w[j] += step[j];
      maxStep = Math.max(maxStep, Math.abs(step[j]));
    }
    if (maxStep < 1e-6) break;
  }
  return w;
}

export function predictLogistic(w: number[], x: number[]): number {
  let z = w[0];
  for (let j = 0; j < x.length; j++) z += w[j + 1] * x[j];
  return 1 / (1 + Math.exp(-z));
}

// AUC por rangos (Mann-Whitney), con promedio de rangos en empates
export function auc(scores: number[], labels: number[]): number {
  const idx = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
  const ranks = new Array(scores.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && scores[idx[j + 1]] === scores[idx[i]]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k]] = avg;
    i = j + 1;
  }
  let pos = 0;
  let sumPos = 0;
  labels.forEach((l, i) => {
    if (l === 1) {
      pos++;
      sumPos += ranks[i];
    }
  });
  const neg = labels.length - pos;
  return (sumPos - (pos * (pos + 1)) / 2) / (pos * neg);
}
