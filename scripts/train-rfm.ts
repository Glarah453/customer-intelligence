import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { modelRuns, segments, customerMetrics } from '../db/schema';
import { computeRfm, segmentName } from '../lib/rfm';

const REF_DATE = '2011-12-10';

async function main() {
  if (process.env.TRAINING_ENABLED !== 'true') {
    throw new Error('TRAINING_ENABLED no es "true": el entrenamiento está deshabilitado.');
  }

  const rows = await computeRfm(REF_DATE);

  // agrupar por segmento
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const name = segmentName(r.r, r.f);
    groups.set(name, [...(groups.get(name) ?? []), r]);
  }

  const [run] = await db
    .insert(modelRuns)
    .values({
      type: 'rfm',
      params: { refDate: REF_DATE },
      metrics: { customers: rows.length },
      cutoffDate: new Date(REF_DATE),
    })
    .returning();

  const avg = (g: typeof rows, k: 'recency' | 'frequency' | 'monetary') =>
    g.reduce((s, x) => s + x[k], 0) / g.length;

  const segRows = await db
    .insert(segments)
    .values(
      [...groups].map(([name, g], i) => ({
        modelRunId: run.id,
        clusterIndex: i,
        name,
        size: g.length,
        centroid: {
          recency: avg(g, 'recency'),
          frequency: avg(g, 'frequency'),
          monetary: avg(g, 'monetary'),
        },
      })),
    )
    .returning();

  const idByName = new Map(segRows.map((s) => [s.name, s.id]));

  const values = rows.map((r) => ({
    customerId: r.customer_id,
    modelRunId: run.id,
    recency: r.recency,
    frequency: r.frequency,
    monetary: r.monetary.toFixed(2),
    rfmScore: r.rfm_score,
    segmentId: idByName.get(segmentName(r.r, r.f))!,
  }));

  for (let i = 0; i < values.length; i += 1000) {
    await db.insert(customerMetrics).values(values.slice(i, i + 1000));
  }

  // activar esta corrida solo si todo salió bien
  await db.update(modelRuns).set({ isActive: false }).where(eq(modelRuns.type, 'rfm'));
  await db.update(modelRuns).set({ isActive: true }).where(eq(modelRuns.id, run.id));

  console.log(`Corrida ${run.id} activa: ${rows.length} clientes, ${segRows.length} segmentos`);
}

main();
