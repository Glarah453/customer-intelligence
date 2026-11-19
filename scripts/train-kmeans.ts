import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { kmeans } from 'ml-kmeans';
import { db } from '../db';
import { modelRuns, segments, customerMetrics } from '../db/schema';
import { computeRfm } from '../lib/rfm';

const REF_DATE = '2011-12-10';
const K_MIN = 2;
const K_MAX = 8;
const K_MIN_FOR_PICK = 3;
const SEEDS = 5;

// ---------- utilidades matemáticas ----------
const dist = (a: number[], b: number[]) =>
  Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

function inertia(X: number[][], labels: number[], centroids: number[][]) {
  return X.reduce((s, x, i) => s + dist(x, centroids[labels[i]]) ** 2, 0);
}

function silhouette(X: number[][], labels: number[], k: number) {
  const n = X.length;
  const sizes = new Array(k).fill(0);
  for (const l of labels) sizes[l]++;

  let total = 0;
  for (let i = 0; i < n; i++) {
    const sums = new Array(k).fill(0);
    for (let j = 0; j < n; j++) {
      if (i !== j) sums[labels[j]] += dist(X[i], X[j]);
    }
    const own = labels[i];
    if (sizes[own] <= 1) continue; // silhouette = 0 para clusters de 1 punto
    const a = sums[own] / (sizes[own] - 1);
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c !== own && sizes[c] > 0) b = Math.min(b, sums[c] / sizes[c]);
    }
    total += (b - a) / Math.max(a, b);
  }
  return total / n;
}

function bestOfSeeds(X: number[][], k: number) {
  let best: { labels: number[]; centroids: number[][]; inertia: number } | null = null;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const res = kmeans(X, k, { initialization: 'kmeans++', seed, maxIterations: 300 });
    const inr = inertia(X, res.clusters, res.centroids);
    if (!best || inr < best.inertia) {
      best = { labels: res.clusters, centroids: res.centroids, inertia: inr };
    }
  }
  return best!;
}

// ---------- nombres de segmento a partir del centroide estandarizado ----------
// z = [recencia, frecuencia, monto]; recencia alta = hace mucho que no compra
function nameCluster([r, f, m]: number[]): string {
  const rHigh = r > 0.4, rLow = r < -0.4;
  const fHigh = f > 0.4 || m > 0.6;
  if (rLow && fHigh) return 'Campeones';
  if (rLow) return 'Recientes';
  if (rHigh && fHigh) return 'En riesgo';
  if (rHigh) return 'Hibernando';
  return fHigh ? 'Leales' : 'Regulares';
}

async function main() {
  if (process.env.TRAINING_ENABLED !== 'true') {
    throw new Error('TRAINING_ENABLED no es "true": el entrenamiento está deshabilitado.');
  }

  const forced = process.argv.find((a) => a.startsWith('--k='));
  const forcedK = forced ? Number(forced.split('=')[1]) : null;

  // 1) RFM -> features transformadas y estandarizadas
  const rows = await computeRfm(REF_DATE);
  const T = rows.map((r) => [
    Math.log1p(r.recency),
    Math.log1p(r.frequency),
    Math.log1p(r.monetary),
  ]);
  const mu = [0, 1, 2].map((j) => mean(T.map((v) => v[j])));
  const sd = [0, 1, 2].map((j) => Math.sqrt(mean(T.map((v) => (v[j] - mu[j]) ** 2))));
  const X = T.map((v) => v.map((x, j) => (x - mu[j]) / sd[j]));

  // 2) probar cada k
  const byK: { k: number; inertia: number; silhouette: number }[] = [];
  const fits = new Map<number, ReturnType<typeof bestOfSeeds>>();
  for (let k = K_MIN; k <= K_MAX; k++) {
    const fit = bestOfSeeds(X, k);
    const sil = silhouette(X, fit.labels, k);
    fits.set(k, fit);
    byK.push({ k, inertia: Math.round(fit.inertia), silhouette: Number(sil.toFixed(4)) });
    console.log(`k=${k}  inercia=${Math.round(fit.inertia)}  silhouette=${sil.toFixed(4)}`);
  }

  // 3) elegir k
  const candidates = byK.filter((x) => x.k >= K_MIN_FOR_PICK);
  const bestK = forcedK ?? candidates.reduce((a, b) => (b.silhouette > a.silhouette ? b : a)).k;
  if (!fits.has(bestK)) throw new Error(`k=${bestK} fuera del rango ${K_MIN}-${K_MAX}`);
  const fit = fits.get(bestK)!;
  const chosen = byK.find((x) => x.k === bestK)!;
  console.log(`\nK elegido: ${bestK}${forcedK ? ' (forzado)' : ''}`);

  // 4) perfil y nombre de cada cluster
  const members = Array.from({ length: bestK }, () => [] as number[]);
  fit.labels.forEach((c, i) => members[c].push(i));

  const used = new Map<string, number>();
  const profiles = members.map((idxs, c) => {
    const base = nameCluster(fit.centroids[c]);
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    const name = n === 1 ? base : `${base} ${String.fromCharCode(64 + n)}`; // 'Leales B'
    return {
      c,
      name,
      size: idxs.length,
      recency: mean(idxs.map((i) => rows[i].recency)),
      frequency: mean(idxs.map((i) => rows[i].frequency)),
      monetary: mean(idxs.map((i) => rows[i].monetary)),
      z: fit.centroids[c],
    };
  });

  console.table(
    profiles.map((p) => ({
      segmento: p.name,
      clientes: p.size,
      'recencia (d)': Math.round(p.recency),
      frecuencia: p.frequency.toFixed(1),
      'monto £': Math.round(p.monetary),
    })),
  );

  // 5) guardar
  const [run] = await db
    .insert(modelRuns)
    .values({
      type: 'kmeans',
      cutoffDate: new Date(REF_DATE),
      params: {
        k: bestK,
        forced: forcedK !== null,
        features: ['recency', 'frequency', 'monetary'],
        transform: 'log1p + zscore',
        mean: mu,
        std: sd,
        seeds: SEEDS,
        initialization: 'kmeans++',
      },
      metrics: {
        customers: rows.length,
        inertia: chosen.inertia,
        silhouette: chosen.silhouette,
        byK,
      },
    })
    .returning();

  const segRows = await db
    .insert(segments)
    .values(
      profiles.map((p) => ({
        modelRunId: run.id,
        clusterIndex: p.c,
        name: p.name,
        size: p.size,
        centroid: {
          recency: p.recency,
          frequency: p.frequency,
          monetary: p.monetary,
          z: p.z,
        },
      })),
    )
    .returning();

  const segIdByCluster = new Map(segRows.map((s) => [s.clusterIndex, s.id]));

  const values = rows.map((r, i) => ({
    customerId: r.customer_id,
    modelRunId: run.id,
    recency: r.recency,
    frequency: r.frequency,
    monetary: r.monetary.toFixed(2),
    rfmScore: r.rfm_score,
    segmentId: segIdByCluster.get(fit.labels[i])!,
  }));

  for (let i = 0; i < values.length; i += 1000) {
    await db.insert(customerMetrics).values(values.slice(i, i + 1000));
  }

  // activar solo si todo salió bien
  await db.update(modelRuns).set({ isActive: false }).where(eq(modelRuns.type, 'kmeans'));
  await db.update(modelRuns).set({ isActive: true }).where(eq(modelRuns.id, run.id));

  console.log(`\nCorrida ${run.id} activa: k=${bestK}, silhouette=${chosen.silhouette}`);
}

main();
