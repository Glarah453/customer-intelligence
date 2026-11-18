import 'dotenv/config';
import { computeRfm, segmentName } from '../lib/rfm';

async function main() {
  const rows = await computeRfm('2011-12-10');
  console.log('Clientes con RFM:', rows.length);
  console.table(rows.slice(0, 5));

  const counts: Record<string, number> = {};
  for (const r of rows) {
    const s = segmentName(r.r, r.f);
    counts[s] = (counts[s] ?? 0) + 1;
  }
  console.table(counts);
}

main();
