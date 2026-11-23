import 'dotenv/config';
import { eq, sql } from 'drizzle-orm';
import { sampleCorrelation } from 'simple-statistics';
import { db } from '../db';
import { modelRuns, customerMetrics } from '../db/schema';
import { computeRfm } from '../lib/rfm';
import {
  expectedAvgValue, expectedPurchases, fitBgNbd, fitGammaGamma, pAlive, type Cust,
} from '../lib/clv';

const REF_DATE = '2011-12-10';      // fin de los datos
const HORIZON_WEEKS = 52;           // CLV a 12 meses
const CAL_END = '2011-06-11';       // validación: calibramos hasta aquí...
const HOLDOUT_WEEKS = 26;           // ...y evaluamos las 26 semanas siguientes

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

// x = compras repetidas, tx = semanas entre 1ª y última compra,
// T = semanas desde la 1ª compra hasta el corte, m = ticket medio de las compras repetidas
async function loadCustomers(cutoff: string): Promise<Cust[]> {
  const res = await db.execute(sql`
    WITH ranked AS (
      SELECT customer_id, ordered_at, total,
             ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY ordered_at, invoice_no) AS rn
      FROM orders
      WHERE ordered_at < ${cutoff}::date
    )
    SELECT customer_id AS id,
           (COUNT(*) - 1)::int AS x,
           (EXTRACT(EPOCH FROM (MAX(ordered_at) - MIN(ordered_at))) / 604800.0)::float AS tx,
           (EXTRACT(EPOCH FROM (${cutoff}::timestamp - MIN(ordered_at))) / 604800.0)::float AS "T",
           COALESCE(AVG(total) FILTER (WHERE rn > 1), 0)::float AS m
    FROM ranked
    GROUP BY customer_id
  `);
  return res.rows as Cust[];
}

async function loadHoldout(from: string, to: string) {
  const res = await db.execute(sql`
    SELECT customer_id AS id, COUNT(*)::int AS n, SUM(total)::float AS revenue
    FROM orders
    WHERE ordered_at >= ${from}::date AND ordered_at < ${to}::date
    GROUP BY customer_id
  `);
  const rows = res.rows as { id: number; n: number; revenue: number }[];
  return new Map(rows.map((r) => [r.id, r]));
}

const BANDS = [
  { label: '0 compras repetidas', test: (x: number) => x === 0 },
  { label: '1', test: (x: number) => x === 1 },
  { label: '2', test: (x: number) => x === 2 },
  { label: '3 a 5', test: (x: number) => x >= 3 && x <= 5 },
  { label: '6 o más', test: (x: number) => x >= 6 },
];

async function validate() {
  const cal = await loadCustomers(CAL_END);
  const holdout = await loadHoldout(CAL_END, REF_DATE);

  const bg = fitBgNbd(cal);
  const gg = fitGammaGamma(cal.filter((c) => c.x > 0 && c.m > 0));
  console.log('Validación · BG/NBD:', { r: round(bg.r), alpha: round(bg.alpha), a: round(bg.a), b: round(bg.b) });
  console.log('Validación · Gamma-Gamma:', { p: round(gg.p), q: round(gg.q), v: round(gg.v) });

  const preds: number[] = [];
  const acts: number[] = [];
  let predSum = 0, actSum = 0, absErr = 0, sqErr = 0, baseAbs = 0, predRev = 0, actRev = 0;
  const bands = BANDS.map((b) => ({ label: b.label, customers: 0, predicted: 0, actual: 0 }));

  for (const c of cal) {
    const pred = expectedPurchases(bg, c, HOLDOUT_WEEKS);
    const h = holdout.get(c.id);
    const actual = h?.n ?? 0;
    const naive = c.T > 0 ? (c.x / c.T) * HOLDOUT_WEEKS : 0; // línea base: ritmo histórico

    preds.push(pred);
    acts.push(actual);
    predSum += pred;
    actSum += actual;
    absErr += Math.abs(pred - actual);
    sqErr += (pred - actual) ** 2;
    baseAbs += Math.abs(naive - actual);
    predRev += pred * expectedAvgValue(gg, c.x, c.m);
    actRev += h?.revenue ?? 0;

    const i = BANDS.findIndex((b) => b.test(c.x));
    bands[i].customers++;
    bands[i].predicted += pred;
    bands[i].actual += actual;
  }

  const n = cal.length;
  const validation = {
    calibrationEnd: CAL_END,
    holdoutEnd: REF_DATE,
    horizonWeeks: HOLDOUT_WEEKS,
    customers: n,
    predictedPurchases: Math.round(predSum),
    actualPurchases: actSum,
    mae: round(absErr / n),
    rmse: round(Math.sqrt(sqErr / n)),
    maeBaseline: round(baseAbs / n),
    correlation: round(sampleCorrelation(preds, acts)),
    predictedRevenue: Math.round(predRev),
    actualRevenue: Math.round(actRev),
    bands: bands.map((b) => ({
      label: b.label,
      customers: b.customers,
      predicted: b.customers ? round(b.predicted / b.customers) : 0,
      actual: b.customers ? round(b.actual / b.customers) : 0,
    })),
  };

  console.log('\nValidación (predicho vs real en las 26 semanas siguientes):');
  console.table({
    'Compras totales': { predicho: validation.predictedPurchases, real: validation.actualPurchases },
    'Ingresos £': { predicho: validation.predictedRevenue, real: validation.actualRevenue },
  });
  console.log(
    `Error absoluto medio por cliente: modelo ${validation.mae} vs línea base ${validation.maeBaseline} · ` +
      `correlación ${validation.correlation}`,
  );
  console.table(validation.bands);
  return validation;
}

async function main() {
  if (process.env.TRAINING_ENABLED !== 'true') {
    throw new Error('TRAINING_ENABLED no es "true": el entrenamiento está deshabilitado.');
  }

  // 1) validación con corte temporal
  const validation = await validate();

  // 2) ajuste final con todos los datos
  const all = await loadCustomers(REF_DATE);
  const repeaters = all.filter((c) => c.x > 0 && c.m > 0);
  const bg = fitBgNbd(all);
  const gg = fitGammaGamma(repeaters);

  // Gamma-Gamma supone que frecuencia y valor por compra son independientes: lo revisamos
  const corr = sampleCorrelation(repeaters.map((c) => c.x), repeaters.map((c) => c.m));
  console.log('\nModelo final · BG/NBD:', { r: round(bg.r), alpha: round(bg.alpha), a: round(bg.a), b: round(bg.b) });
  console.log('Modelo final · Gamma-Gamma:', { p: round(gg.p), q: round(gg.q), v: round(gg.v) });
  console.log(`Correlación frecuencia vs valor por compra: ${round(corr)} ${Math.abs(corr) > 0.3 ? '(⚠ supuesto débil)' : '(ok)'}`);

  // 3) CLV por cliente
  const rfm = new Map((await computeRfm(REF_DATE)).map((r) => [r.customer_id, r]));
  const [run] = await db
    .insert(modelRuns)
    .values({
      type: 'clv',
      cutoffDate: new Date(REF_DATE),
      params: {
        horizonWeeks: HORIZON_WEEKS,
        timeUnit: 'weeks',
        bgnbd: { r: bg.r, alpha: bg.alpha, a: bg.a, b: bg.b },
        gammaGamma: { p: gg.p, q: gg.q, v: gg.v },
      },
      metrics: {
        customers: all.length,
        repeaters: repeaters.length,
        corrFreqValue: round(corr),
        validation,
      },
    })
    .returning();

  const values = all.flatMap((c) => {
    const r = rfm.get(c.id);
    if (!r) return [];
    const clv = expectedPurchases(bg, c, HORIZON_WEEKS) * expectedAvgValue(gg, c.x, c.m);
    return [{
      customerId: c.id,
      modelRunId: run.id,
      recency: r.recency,
      frequency: r.frequency,
      monetary: r.monetary.toFixed(2),
      rfmScore: r.rfm_score,
      clv12m: (Number.isFinite(clv) ? Math.max(0, clv) : 0).toFixed(2),
      pAlive: pAlive(bg, c),
    }];
  });

  for (let i = 0; i < values.length; i += 1000) {
    await db.insert(customerMetrics).values(values.slice(i, i + 1000));
  }

  await db.update(modelRuns).set({ isActive: false }).where(eq(modelRuns.type, 'clv'));
  await db.update(modelRuns).set({ isActive: true }).where(eq(modelRuns.id, run.id));

  const total = values.reduce((s, v) => s + Number(v.clv12m), 0);
  console.log(`\nCorrida ${run.id} activa: ${values.length} clientes · CLV total a 12 meses £${Math.round(total).toLocaleString('en-GB')}`);
}

main();
