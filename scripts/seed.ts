
// scripts/seed.ts
import { config } from 'dotenv';
config({ path: '.env' });

import fs from 'node:fs';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });

// type Row = Record<string, string>;



async function createTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS customers (
      id INT PRIMARY KEY,
      country TEXT NOT NULL,
      first_order_at TIMESTAMP NOT NULL
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      invoice_no TEXT PRIMARY KEY,
      customer_id INT NOT NULL REFERENCES customers(id),
      ordered_at TIMESTAMP NOT NULL,
      total NUMERIC(12,2) NOT NULL
    )`;

  await sql`
    CREATE INDEX IF NOT EXISTS orders_customer_idx
    ON orders (customer_id, ordered_at)`;
}




type Row = Record<string, any>;


function readRows(path: string): Row[] {
  const wb = XLSX.read(fs.readFileSync(path), { type: 'buffer', cellDates: true });
  // junta las dos hojas del archivo
  return wb.SheetNames.flatMap((name) =>
    XLSX.utils.sheet_to_json<Row>(wb.Sheets[name])
  );
}




// function loadAndAggregate(path: string) {
function loadAndAggregate(rows: Row[]) {

  // const csv = fs.readFileSync(path, 'utf8');
  // const { data } = Papa.parse<Row>(csv, { header: true, skipEmptyLines: true });

  const customers = new Map<number, { id: number; country: string; first_order_at: Date }>();
  const orders = new Map<string, { invoice_no: string; customer_id: number; ordered_at: Date; total: number }>();

  // for (const r of data) {
  for (const r of rows) {
    const invoice = String(r.Invoice);
    const customerId = Number(r['Customer ID']);
    const qty = Number(r.Quantity);
    const price = Number(r.Price);

    // sin cliente, cancelaciones (facturas "C...") o cantidades/precios inválidos
    // if (!customerId || r.Invoice.startsWith('C') || qty <= 0 || price <= 0) continue;
    if (!customerId || invoice.startsWith('C') || qty <= 0 || price <= 0) continue;

    const date = new Date(r.InvoiceDate);

    const c = customers.get(customerId);
    if (!c) {
      customers.set(customerId, { id: customerId, country: r.Country, first_order_at: date });
    } else if (date < c.first_order_at) {
      c.first_order_at = date;
    }

    const o = orders.get(invoice);
    if (!o) {
      orders.set(invoice, { invoice_no: r.Invoice, customer_id: customerId, ordered_at: date, total: qty * price });
    } else {
      o.total += qty * price;
    }
  }

  return { customers: [...customers.values()], orders: [...orders.values()] };
}

async function insertInChunks<T extends object>(table: string, rows: T[], size = 1000) {
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    await sql`INSERT INTO ${sql(table)} ${sql(chunk)} ON CONFLICT DO NOTHING`;
  }
}

async function main() {
  await createTables();
  // const { customers, orders } = loadAndAggregate('data/online_retail_II.xlsx');

  const rows = readRows('data/online_retail_II.xlsx');
  const { customers, orders } = loadAndAggregate(rows);

  await insertInChunks('customers', customers);
  await insertInChunks('orders', orders);

  console.log(`Listo: ${customers.length} clientes, ${orders.length} órdenes`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
