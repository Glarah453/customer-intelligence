import { and, eq, sql } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/db';
import { modelRuns, segments } from '@/db/schema';

type KMetrics = {
  customers: number;
  inertia: number;
  silhouette: number;
  byK: { k: number; inertia: number; silhouette: number }[];
};
type Centroid = { recency: number; frequency: number; monetary: number };

export async function getTrainOverview() {
  'use cache';
  cacheLife('hours');
  cacheTag('dashboard');

  const run = await db.query.modelRuns.findFirst({
    where: and(eq(modelRuns.type, 'kmeans'), eq(modelRuns.isActive, true)),
  });
  if (!run) return null;

  const segs = await db
    .select()
    .from(segments)
    .where(eq(segments.modelRunId, run.id))
    .orderBy(segments.clusterIndex);

  // muestra de 1500 clientes para el scatter (5878 puntos harían lento el gráfico)
  const pts = await db.execute(sql`
    SELECT s.cluster_index AS cluster, cm.recency, cm.monetary::float AS monetary
    FROM customer_metrics cm
    JOIN segments s ON s.id = cm.segment_id
    WHERE cm.model_run_id = ${run.id} AND cm.monetary > 0
    ORDER BY random()
    LIMIT 1500
  `);

  return {
    runId: run.id,
    createdAt: run.createdAt.toISOString().slice(0, 16).replace('T', ' '),
    k: (run.params as { k: number }).k,
    metrics: run.metrics as KMetrics,
    segs: segs.map((s) => ({
      index: s.clusterIndex,
      name: s.name,
      size: s.size,
      centroid: s.centroid as Centroid,
    })),
    points: pts.rows as { cluster: number; recency: number; monetary: number }[],
  };
}
