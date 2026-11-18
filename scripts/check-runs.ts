import 'dotenv/config';
import { db } from '../db';
import { modelRuns } from '../db/schema';

db.select()
  .from(modelRuns)
  .then((rows) => console.table(rows.map(({ params, metrics, ...r }) => r)));
