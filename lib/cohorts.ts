import { sql } from 'drizzle-orm';
import { cacheLife } from 'next/cache';
import { db } from '@/db';

export type CohortRow = {
  cohort: string;          // 'YYYY-MM'
  size: number;            // clientes de la cohorte
  retention: (number | null)[]; // % por mes 0..12, null = aún no observable
};

const MAX_MONTHS = 12;

export async function getCohorts(): Promise<CohortRow[]> {
  'use cache';
  cacheLife('hours');

  const res = await db.execute(sql`
    SELECT
      to_char(date_trunc('month', c.first_order_at), 'YYYY-MM') AS cohort,
      ((EXTRACT(YEAR FROM o.ordered_at) - EXTRACT(YEAR FROM c.first_order_at)) * 12
        + (EXTRACT(MONTH FROM o.ordered_at) - EXTRACT(MONTH FROM c.first_order_at)))::int AS m,
      COUNT(DISTINCT o.customer_id)::int AS active
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    GROUP BY 1, 2
    HAVING ((EXTRACT(YEAR FROM o.ordered_at) - EXTRACT(YEAR FROM c.first_order_at)) * 12
        + (EXTRACT(MONTH FROM o.ordered_at) - EXTRACT(MONTH FROM c.first_order_at)))::int <= ${MAX_MONTHS}
    ORDER BY 1, 2
  `);

  const rows = res.rows as { cohort: string; m: number; active: number }[];
  if (rows.length === 0) return [];

  const idx = (ym: string) => {
    const [y, mo] = ym.split('-').map(Number);
    return y * 12 + mo;
  };

  // const lastMonth = Math.max(...rows.map((r) => idx(r.cohort) + r.m));
  
  // el último mes del dataset (dic 2011) está incompleto: lo excluimos
  const lastMonth = Math.max(...rows.map((r) => idx(r.cohort) + r.m)) - 1;

  const byCohort = new Map<string, Map<number, number>>();
  for (const r of rows) {
    if (!byCohort.has(r.cohort)) byCohort.set(r.cohort, new Map());
    byCohort.get(r.cohort)!.set(r.m, r.active);
  }

  return [...byCohort].map(([cohort, months]) => {
    const size = months.get(0) ?? 0;
    const retention = Array.from({ length: MAX_MONTHS + 1 }, (_, m) => {
      if (idx(cohort) + m > lastMonth) return null; // mes futuro: sin dato
      return size ? Math.round(((months.get(m) ?? 0) / size) * 1000) / 10 : 0;
    });
    return { cohort, size, retention };
  });
}
