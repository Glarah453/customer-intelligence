import { and, eq, sql } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/db';
import { modelRuns } from '@/db/schema';

export type ClvValidation = {
  calibrationEnd: string;
  holdoutEnd: string;
  horizonWeeks: number;
  customers: number;
  predictedPurchases: number;
  actualPurchases: number;
  mae: number;
  rmse: number;
  maeBaseline: number;
  correlation: number;
  predictedRevenue: number;
  actualRevenue: number;
  bands: { label: string; customers: number; predicted: number; actual: number }[];
};

export async function getClv() {
  'use cache';
  cacheLife('hours');
  cacheTag('dashboard');

  const run = await db.query.modelRuns.findFirst({
    where: and(eq(modelRuns.type, 'clv'), eq(modelRuns.isActive, true)),
  });
  if (!run) return null;

  const deciles = await db.execute(sql`
    SELECT d::int AS d, COUNT(*)::int AS customers, SUM(clv)::float AS clv
    FROM (
      SELECT clv_12m::float AS clv, NTILE(10) OVER (ORDER BY clv_12m DESC) AS d
      FROM customer_metrics
      WHERE model_run_id = ${run.id}
    ) t
    GROUP BY d
    ORDER BY d
  `);

  const top = await db.execute(sql`
    SELECT cm.customer_id AS id, c.country, cm.frequency::int AS orders,
           cm.monetary::float AS spent, cm.p_alive::float AS p_alive, cm.clv_12m::float AS clv
    FROM customer_metrics cm
    JOIN customers c ON c.id = cm.customer_id
    WHERE cm.model_run_id = ${run.id}
    ORDER BY cm.clv_12m DESC
    LIMIT 20
  `);

  const dec = deciles.rows as { d: number; customers: number; clv: number }[];
  const customers = dec.reduce((s, x) => s + x.customers, 0);
  const total = dec.reduce((s, x) => s + x.clv, 0);
  const params = run.params as { horizonWeeks: number };
  const metrics = run.metrics as { validation: ClvValidation };

  return {
    cutoff: run.cutoffDate ? run.cutoffDate.toISOString().slice(0, 10) : null,
    horizonWeeks: params.horizonWeeks,
    customers,
    total,
    avg: customers ? total / customers : 0,
    topDecileShare: total ? dec[0].clv / total : 0,
    deciles: dec,
    validation: metrics.validation,
    top: top.rows as {
      id: number; country: string; orders: number; spent: number; p_alive: number; clv: number;
    }[],
  };
}
