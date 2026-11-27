import { sql } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/db';

export type StatKey = 'order_value' | 'orders_per_customer' | 'spend_per_customer';

export async function getEda() {
  'use cache';
  cacheLife('hours');
  cacheTag('dashboard');

  const [summaryRes, statsRes, monthlyRes, bucketsRes, countriesRes, paretoRes] = await Promise.all([
    db.execute(sql`
      SELECT COUNT(DISTINCT o.customer_id)::int AS customers,
             COUNT(*)::int AS orders,
             SUM(o.total)::float AS revenue,
             AVG(o.total)::float AS avg_ticket,
             to_char(MIN(o.ordered_at), 'YYYY-MM-DD') AS first_day,
             to_char(MAX(o.ordered_at), 'YYYY-MM-DD') AS last_day,
             (SELECT COUNT(DISTINCT country)::int FROM customers) AS countries
      FROM orders o
    `),
    db.execute(sql`
      SELECT 'order_value' AS stat,
             AVG(total)::float AS mean,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY total::float) AS median,
             percentile_cont(0.9) WITHIN GROUP (ORDER BY total::float) AS p90,
             MAX(total)::float AS max_value
      FROM orders
      UNION ALL
      SELECT 'orders_per_customer', AVG(n)::float,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY n::float),
             percentile_cont(0.9) WITHIN GROUP (ORDER BY n::float),
             MAX(n)::float
      FROM (SELECT COUNT(*) AS n FROM orders GROUP BY customer_id) c
      UNION ALL
      SELECT 'spend_per_customer', AVG(s)::float,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY s::float),
             percentile_cont(0.9) WITHIN GROUP (ORDER BY s::float),
             MAX(s)::float
      FROM (SELECT SUM(total) AS s FROM orders GROUP BY customer_id) c
    `),
    db.execute(sql`
      SELECT to_char(date_trunc('month', ordered_at), 'YYYY-MM') AS month,
             SUM(total)::float AS revenue
      FROM orders
      GROUP BY 1
      ORDER BY 1
    `),
    db.execute(sql`
      SELECT CASE WHEN n = 1 THEN '1'
                  WHEN n = 2 THEN '2'
                  WHEN n <= 5 THEN '3 a 5'
                  WHEN n <= 10 THEN '6 a 10'
                  ELSE 'Más de 10' END AS bucket,
             MIN(n)::int AS sort_key,
             COUNT(*)::int AS customers
      FROM (SELECT COUNT(*) AS n FROM orders GROUP BY customer_id) t
      GROUP BY 1
      ORDER BY sort_key
    `),
    db.execute(sql`
      SELECT c.country, SUM(o.total)::float AS revenue, COUNT(DISTINCT c.id)::int AS customers
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      GROUP BY c.country
      ORDER BY revenue DESC
    `),
    db.execute(sql`
      WITH s AS (
        SELECT customer_id, SUM(total)::float AS spent FROM orders GROUP BY customer_id
      ), r AS (
        SELECT spent, NTILE(20) OVER (ORDER BY spent DESC) AS g FROM s
      )
      SELECT g::int AS g, SUM(spent)::float AS revenue
      FROM r
      GROUP BY g
      ORDER BY g
    `),
  ]);

  const summary = (summaryRes.rows as {
    customers: number; orders: number; revenue: number; avg_ticket: number;
    first_day: string; last_day: string; countries: number;
  }[])[0];

  const stats = statsRes.rows as {
    stat: StatKey; mean: number; median: number; p90: number; max_value: number;
  }[];

  const monthly = monthlyRes.rows as { month: string; revenue: number }[];
  const buckets = bucketsRes.rows as { bucket: string; customers: number }[];

  // países: los 8 principales y el resto agrupado
  const all = countriesRes.rows as { country: string; revenue: number; customers: number }[];
  const totalRev = all.reduce((s, c) => s + c.revenue, 0);
  const rest = all.slice(8);
  const countries = [
    ...all.slice(0, 8).map((c) => ({ name: c.country, revenue: c.revenue })),
    ...(rest.length
      ? [{ name: `Otros (${rest.length})`, revenue: rest.reduce((s, c) => s + c.revenue, 0) }]
      : []),
  ];
  const ukShare = (all.find((c) => c.country === 'United Kingdom')?.revenue ?? 0) / totalRev;

  // Pareto: ingresos acumulados por grupos de 5% de clientes, de mayor a menor gasto
  const groups = paretoRes.rows as { g: number; revenue: number }[];
  const paretoTotal = groups.reduce((s, x) => s + x.revenue, 0);
  let acc = 0;
  const pareto = [
    { pct: 0, share: 0, equal: 0 },
    ...groups.map((x) => {
      acc += x.revenue;
      return { pct: x.g * 5, share: Math.round((acc / paretoTotal) * 1000) / 10, equal: x.g * 5 };
    }),
  ];
  const shareAt = (pct: number) => pareto.find((p) => p.pct === pct)?.share ?? 0;

  return {
    summary, stats, monthly, buckets, countries, ukShare, pareto,
    top10Share: shareAt(10),
    top20Share: shareAt(20),
  };
}
