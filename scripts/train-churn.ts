import 'dotenv/config';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { modelRuns, customerMetrics } from '../db/schema';
import { fitBgNbd, pAlive } from '../lib/clv';
import { auc, fitLogistic, predictLogistic } from '../lib/ml';

const ACTIVE_DAYS = 180;   // "activo" = compró en los últimos 180 días
const HORIZON_DAYS = 90;   // churn = no compra en los 90 días siguientes (ver SQL)

const TRAIN_CUTOFFS = [
  '2010-06-10', '2010-07-10', '2010-08-10', '2010-09-10', '2010-10-10',
  '2010-11-10', '2010-12-10', '2011-01-10', '2011-02-10', '2011-03-10',
];
const VAL_CUTOFF = '2011-06-10';   // elige la regularización
const TEST_CUTOFF = '2011-09-11';  // evaluación final (ventana hasta 2011-12-10)
const FINAL_CUTOFF = '2011-12-10'; // fecha en la que puntuamos a los clientes

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

type Row = {
  id: number; n: number; recency: number; tenure: number; spent: number;
  avg_gap: number | null; n90: number; n90_180: number; spend90: number;
  tx: number; T: number; churned: number;
};

// Foto de la base en una fecha de corte: variables con datos anteriores al corte
// y etiqueta (churned) según lo que ocurrió en los 90 días posteriores.
async function loadSnapshot(cutoff: string): Promise<Row[]> {
  const res = await db.execute(sql`
    WITH hist AS (
      SELECT customer_id,
             COUNT(*)::int AS n,
             MIN(ordered_at) AS first_at,
             MAX(ordered_at) AS last_at,
             SUM(total)::float AS spent,
             (COUNT(*) FILTER (WHERE ordered_at >= ${cutoff}::date - 90))::int AS n90,
             (COUNT(*) FILTER (WHERE ordered_at >= ${cutoff}::date - 180
                                 AND ordered_at < ${cutoff}::date - 90))::int AS n90_180,
             COALESCE(SUM(total) FILTER (WHERE ordered_at >= ${cutoff}::date - 90), 0)::float AS spend90
      FROM orders
      WHERE ordered_at < ${cutoff}::date
      GROUP BY customer_id
    ),
    fut AS (
      SELECT DISTINCT customer_id
      FROM orders
      WHERE ordered_at >= ${cutoff}::date AND ordered_at < ${cutoff}::date + 90
    )
    SELECT h.customer_id AS id, h.n,
           (${cutoff}::date - h.last_at::date)::int AS recency,
           (${cutoff}::date - h.first_at::date)::int AS tenure,
           h.spent, h.n90, h.n90_180, h.spend90,
           CASE WHEN h.n > 1
                THEN (EXTRACT(EPOCH FROM (h.last_at - h.first_at)) / 86400.0 / (h.n - 1))::float
           END AS avg_gap,
           (EXTRACT(EPOCH FROM (h.last_at - h.first_at)) / 604800.0)::float AS tx,
           (EXTRACT(EPOCH FROM (${cutoff}::timestamp - h.first_at)) / 604800.0)::float AS "T",
           (CASE WHEN f.customer_id IS NULL THEN 1 ELSE 0 END)::int AS churned
    FROM hist h
    LEFT JOIN fut f ON f.customer_id = h.customer_id
  `);
  return res.rows as Row[];
}

const FEATURES = [
  'recencia (log)',
  'frecuencia (log)',
  'gasto total (log)',
  'ticket medio (log)',
  'antigüedad (log)',
  'órdenes últimos 90 d (log)',
  'órdenes 90-180 d atrás (log)',
  'gasto últimos 90 d (log)',
  'retraso vs su ritmo de compra (log)',
  'compra única',
];

function toVec(r: Row): number[] {
  const gap = r.avg_gap ?? 120; // sin ritmo propio (1 sola compra): valor de referencia
  return [
    Math.log1p(r.recency),
    Math.log1p(r.n),
    Math.log1p(r.spent),
    Math.log1p(r.spent / r.n),
    Math.log1p(r.tenure),
    Math.log1p(r.n90),
    Math.log1p(r.n90_180),
    Math.log1p(r.spend90),
    Math.log1p(r.recency / Math.max(gap, 1)),
    r.n === 1 ? 1 : 0,
  ];
}

function makeScaler(X: number[][]) {
  const d = X[0].length;
  const mu = new Array(d).fill(0);
  const variance = new Array(d).fill(0);
  for (const x of X) x.forEach((v, j) => (mu[j] += v / X.length));
  for (const x of X) x.forEach((v, j) => (variance[j] += (v - mu[j]) ** 2 / X.length));
  const sd = variance.map((v) => Math.sqrt(v) || 1);
  return { mean: mu, std: sd, apply: (x: number[]) => x.map((v, j) => (v - mu[j]) / sd[j]) };
}

const build = (rows: Row[]) => ({ X: rows.map(toVec), y: rows.map((r) => r.churned) });
const active = (rows: Row[]) => rows.filter((r) => r.recency <= ACTIVE_DAYS);

async function main() {
  if (process.env.TRAINING_ENABLED !== 'true') {
    throw new Error('TRAINING_ENABLED no es "true": el entrenamiento está deshabilitado.');
  }

  // 1) fotos de la base en cada fecha de corte
  const snaps = new Map<string, Row[]>();
  for (const c of [...TRAIN_CUTOFFS, VAL_CUTOFF, TEST_CUTOFF]) snaps.set(c, await loadSnapshot(c));

  const trainRows = TRAIN_CUTOFFS.flatMap((c) => active(snaps.get(c)!));
  const valRows = active(snaps.get(VAL_CUTOFF)!);
  const testAll = snaps.get(TEST_CUTOFF)!;
  const testRows = active(testAll);
  console.log(
    `Filas · entrenamiento ${trainRows.length} · validación ${valRows.length} · prueba ${testRows.length}`,
  );

  // 2) elegir la regularización con la foto de validación
  const train = build(trainRows);
  const val = build(valRows);
  const sc1 = makeScaler(train.X);
  const gridRes = [0.01, 0.1, 1, 10, 100].map((lambda) => {
    const w = fitLogistic(train.X.map(sc1.apply), train.y, lambda);
    const scores = val.X.map((x) => predictLogistic(w, sc1.apply(x)));
    return { lambda, aucValidacion: round(auc(scores, val.y)) };
  });
  console.table(gridRes);
  const bestLambda = gridRes.reduce((a, b) => (b.aucValidacion > a.aucValidacion ? b : a)).lambda;
  console.log(`Regularización elegida: λ=${bestLambda}`);

  // 3) evaluación final en la foto de prueba (entrenando con entrenamiento + validación)
  const trVal = build([...trainRows, ...valRows]);
  const sc2 = makeScaler(trVal.X);
  const w2 = fitLogistic(trVal.X.map(sc2.apply), trVal.y, bestLambda);

  const test = build(testRows);
  const pTest = test.X.map((x) => predictLogistic(w2, sc2.apply(x)));
  const aucModel = auc(pTest, test.y);
  const aucRecency = auc(testRows.map((r) => r.recency), test.y);

  const bg = fitBgNbd(testAll.map((r) => ({ id: r.id, x: r.n - 1, tx: r.tx, T: r.T, m: 0 })));
  const aucBgNbd = auc(
    testRows.map((r) => 1 - pAlive(bg, { x: r.n - 1, tx: r.tx, T: r.T })),
    test.y,
  );

  const order = pTest.map((_, i) => i).sort((a, b) => pTest[b] - pTest[a]);
  const churnedTotal = test.y.reduce((s, v) => s + v, 0);
  const baseRate = churnedTotal / test.y.length;
  const k20 = Math.round(order.length * 0.2);
  const hits = order.slice(0, k20).reduce((s, i) => s + test.y[i], 0);
  const precision20 = hits / k20;
  const recall20 = hits / churnedTotal;
  const lift20 = precision20 / baseRate;

  const calibration = Array.from({ length: 10 }, (_, d) => {
    const slice = order.slice(
      Math.floor((order.length * d) / 10),
      Math.floor((order.length * (d + 1)) / 10),
    );
    return {
      decile: d + 1, // 1 = mayor riesgo
      customers: slice.length,
      predicted: round(mean(slice.map((i) => pTest[i]))),
      actual: round(mean(slice.map((i) => test.y[i]))),
    };
  });

  const testMetrics = {
    cutoff: TEST_CUTOFF,
    customers: testRows.length,
    baseRate: round(baseRate),
    aucModel: round(aucModel),
    aucRecency: round(aucRecency),
    aucBgNbd: round(aucBgNbd),
    precision20: round(precision20),
    recall20: round(recall20),
    lift20: round(lift20, 2),
    calibration,
  };

  console.log('\nPrueba final (clientes activos al 2011-09-11, churn a 90 días):');
  console.table({
    'Tasa de churn real': { valor: testMetrics.baseRate },
    'AUC · regresión logística': { valor: testMetrics.aucModel },
    'AUC · regla "más días sin comprar"': { valor: testMetrics.aucRecency },
    'AUC · 1 − P(activo) BG/NBD': { valor: testMetrics.aucBgNbd },
    'Precisión en el 20% de mayor riesgo': { valor: testMetrics.precision20 },
    'Cobertura del churn en ese 20%': { valor: testMetrics.recall20 },
    'Lift del 20% de mayor riesgo': { valor: testMetrics.lift20 },
  });
  console.log('Calibración por decil de riesgo (1 = mayor riesgo):');
  console.table(calibration);

  // 4) modelo final: todas las fotos etiquetadas
  const all = build([...trainRows, ...valRows, ...testRows]);
  const sc3 = makeScaler(all.X);
  const w3 = fitLogistic(all.X.map(sc3.apply), all.y, bestLambda);

  const weights = FEATURES.map((feature, j) => ({ feature, peso: round(w3[j + 1]) })).sort(
    (a, b) => Math.abs(b.peso) - Math.abs(a.peso),
  );
  console.log('\nPesos del modelo final (positivo = aumenta el riesgo de churn):');
  console.table(weights);

  // 5) puntuar a los clientes activos hoy
  const finalRows = active(await loadSnapshot(FINAL_CUTOFF));
  const pFinal = finalRows.map((r) => predictLogistic(w3, sc3.apply(toVec(r))));
  const atRisk = pFinal.filter((p) => p > 0.5).length;

  const [run] = await db
    .insert(modelRuns)
    .values({
      type: 'churn',
      cutoffDate: new Date(FINAL_CUTOFF),
      params: {
        activeDays: ACTIVE_DAYS,
        horizonDays: HORIZON_DAYS,
        lambda: bestLambda,
        features: FEATURES,
        mean: sc3.mean,
        std: sc3.std,
        coefficients: w3,
        trainCutoffs: TRAIN_CUTOFFS,
        valCutoff: VAL_CUTOFF,
        testCutoff: TEST_CUTOFF,
      },
      metrics: {
        activeCustomers: finalRows.length,
        atRisk,
        rows: { train: trainRows.length, validation: valRows.length, test: testRows.length },
        lambdaGrid: gridRes,
        test: testMetrics,
        weights,
      },
    })
    .returning();

  const values = finalRows.map((r, i) => ({
    customerId: r.id,
    modelRunId: run.id,
    recency: r.recency,
    frequency: r.n,
    monetary: r.spent.toFixed(2),
    churnProb: pFinal[i],
  }));
  for (let i = 0; i < values.length; i += 1000) {
    await db.insert(customerMetrics).values(values.slice(i, i + 1000));
  }

  await db.update(modelRuns).set({ isActive: false }).where(eq(modelRuns.type, 'churn'));
  await db.update(modelRuns).set({ isActive: true }).where(eq(modelRuns.id, run.id));

  console.log(
    `\nCorrida ${run.id} activa: ${values.length} clientes activos puntuados · ${atRisk} con riesgo de churn > 50%`,
  );
}

main();
