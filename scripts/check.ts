// scripts/check.ts
import 'dotenv/config';
import { count, min, max } from 'drizzle-orm';
import { db } from '../db';
import { orders, customers } from '../db/schema';

async function main() {
  const [c] = await db.select({ n: count() }).from(customers);
  const [o] = await db
    .select({ n: count(), desde: min(orders.orderedAt), hasta: max(orders.orderedAt) })
    .from(orders);
  console.log({ clientes: c.n, ordenes: o.n, rango: [o.desde, o.hasta] });
}

main();
