import { and, desc, eq, sql } from 'drizzle-orm';
import { cacheLife } from 'next/cache';
import { db } from '@/db';
import { modelRuns, segments, customerMetrics } from '@/db/schema';

export async function getRfmDashboard() {
  'use cache';
  cacheLife('hours'); // el dashboard solo lee; se refresca cada hora

  const run = await db.query.modelRuns.findFirst({
    where: and(eq(modelRuns.type, 'rfm'), eq(modelRuns.isActive, true)),
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

  return {
    cutoff: run.cutoffDate ? run.cutoffDate.toISOString().slice(0, 10) : null,
    segs,
  };
}
