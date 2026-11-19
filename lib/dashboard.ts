import { and, desc, eq, sql } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/db';
import { modelRuns, segments, customerMetrics } from '@/db/schema';

export type ModelType = 'rfm' | 'kmeans';

export async function getDashboard(model: ModelType) {
  'use cache';
  cacheLife('hours');
  cacheTag('dashboard'); // permite invalidar al reentrenar

  const run = await db.query.modelRuns.findFirst({
    where: and(eq(modelRuns.type, model), eq(modelRuns.isActive, true)),
  });
  if (!run) return null;

  const revenueExpr = sql<number>`coalesce(sum(${customerMetrics.monetary}), 0)::float`;
  const ordersExpr = sql<number>`coalesce(sum(${customerMetrics.frequency}), 0)::int`;

  const segs = await db
    .select({
      name: segments.name,
      size: segments.size,
      revenue: revenueExpr,
      orders: ordersExpr,
    })
    .from(segments)
    .leftJoin(customerMetrics, eq(customerMetrics.segmentId, segments.id))
    .where(eq(segments.modelRunId, run.id))
    .groupBy(segments.id, segments.name, segments.size)
    .orderBy(desc(revenueExpr));

  const params = run.params as { k?: number } | null;
  const metrics = run.metrics as { silhouette?: number } | null;

  return {
    cutoff: run.cutoffDate ? run.cutoffDate.toISOString().slice(0, 10) : null,
    k: params?.k ?? null,
    silhouette: metrics?.silhouette ?? null,
    segs,
  };
}
