import { and, eq, sql } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/db';
import { modelRuns } from '@/db/schema';

export type ChurnMetrics = {
  activeCustomers: number;
  test: {
    cutoff: string;
    customers: number;
    baseRate: number;
    aucModel: number;
    aucRecency: number;
    aucBgNbd: number;
    precision20: number;
    recall20: number;
    lift20: number;
    calibration: { decile: number; customers: number; predicted: number; actual: number }[];
  };
  weights: { feature: string; peso: number }[];
};

const BAND_LABELS: Record<number, string> = {
  1: 'Alto (≥70%)',
  2: 'Medio (40-70%)',
  3: 'Bajo (<40%)',
};

export async function getChurn() {
  'use cache';
  cacheLife('hours');
  cacheTag('dashboard');

  const [run, clvRun] = await Promise.all([
    db.query.modelRuns.findFirst({ where: and(eq(modelRuns.type, 'churn'), eq(modelRuns.isActive, true)) }),
    db.query.modelRuns.findFirst({ where: and(eq(modelRuns.type, 'clv'), eq(modelRuns.isActive, true)) }),
  ]);
  if (!run || !clvRun) return null;

  const [bandsRes, topRes] = await Promise.all([
    db.execute(sql`
      SELECT CASE WHEN ch.churn_prob >= 0.7 THEN 1 WHEN ch.churn_prob >= 0.4 THEN 2 ELSE 3 END AS band,
             COUNT(*)::int AS customers,
             SUM(cl.clv_12m::float)::float AS clv,
             SUM(ch.churn_prob::float * cl.clv_12m::float)::float AS at_risk
      FROM customer_metrics ch
      JOIN customer_metrics cl ON cl.customer_id = ch.customer_id AND cl.model_run_id = ${clvRun.id}
      WHERE ch.model_run_id = ${run.id}
      GROUP BY band
      ORDER BY band
    `),
    db.execute(sql`
      SELECT ch.customer_id AS id, c.country, ch.recency::int AS recency, ch.frequency::int AS orders,
             ch.churn_prob::float AS risk, cl.clv_12m::float AS clv,
             (ch.churn_prob::float * cl.clv_12m::float)::float AS at_risk
      FROM customer_metrics ch
      JOIN customers c ON c.id = ch.customer_id
      JOIN customer_metrics cl ON cl.customer_id = ch.customer_id AND cl.model_run_id = ${clvRun.id}
      WHERE ch.model_run_id = ${run.id}
      ORDER BY at_risk DESC
      LIMIT 25
    `),
  ]);

  const bands = (bandsRes.rows as { band: number; customers: number; clv: number; at_risk: number }[]).map(
    (b) => ({ ...b, label: BAND_LABELS[b.band] }),
  );
  const params = run.params as { activeDays: number; horizonDays: number };

  return {
    cutoff: run.cutoffDate ? run.cutoffDate.toISOString().slice(0, 10) : null,
    activeDays: params.activeDays,
    horizonDays: params.horizonDays,
    metrics: run.metrics as ChurnMetrics,
    bands,
    totals: {
      customers: bands.reduce((s, b) => s + b.customers, 0),
      clv: bands.reduce((s, b) => s + b.clv, 0),
      atRisk: bands.reduce((s, b) => s + b.at_risk, 0),
    },
    top: topRes.rows as {
      id: number; country: string; recency: number; orders: number;
      risk: number; clv: number; at_risk: number;
    }[],
  };
}
