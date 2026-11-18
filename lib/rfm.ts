import { sql } from 'drizzle-orm';
import { db } from '../db';

export type RfmRow = {
  customer_id: number;
  recency: number;
  frequency: number;
  monetary: number;
  r: number;
  f: number;
  m: number;
  rfm_score: string;
};

export async function computeRfm(refDate: string): Promise<RfmRow[]> {
  const res = await db.execute(sql`
    WITH base AS (
      SELECT
        customer_id,
        (${refDate}::date - MAX(ordered_at)::date)::int AS recency,
        COUNT(*)::int AS frequency,
        SUM(total)::float AS monetary
      FROM orders
      WHERE ordered_at < ${refDate}::date
      GROUP BY customer_id
    )
    SELECT
      customer_id, recency, frequency, monetary,
      (NTILE(5) OVER (ORDER BY recency DESC))::int AS r,
      (NTILE(5) OVER (ORDER BY frequency ASC))::int AS f,
      (NTILE(5) OVER (ORDER BY monetary ASC))::int AS m
    FROM base
  `);

  return (res.rows as any[]).map((x) => ({
    ...x,
    rfm_score: `${x.r}${x.f}${x.m}`,
  }));
}

// Reglas simples de segmentación a partir de R y F
export function segmentName(r: number, f: number): string {
  if (r >= 4 && f >= 4) return 'Campeones';
  if (r >= 3 && f >= 3) return 'Leales';
  if (r >= 4 && f <= 2) return 'Nuevos / prometedores';
  if (r <= 2 && f >= 4) return 'No puedo perderlos';
  if (r <= 2 && f >= 2) return 'En riesgo';
  if (r <= 2) return 'Hibernando';
  return 'Necesitan atención';
}
