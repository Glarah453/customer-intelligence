import {
  pgTable, integer, text, timestamp, numeric, index,
  serial, jsonb, real, boolean,
} from 'drizzle-orm/pg-core';

// ---- Datos (ya existen) ----
export const customers = pgTable('customers', {
  id: integer('id').primaryKey(),
  country: text('country').notNull(),
  firstOrderAt: timestamp('first_order_at').notNull(),
});

export const orders = pgTable(
  'orders',
  {
    invoiceNo: text('invoice_no').primaryKey(),
    customerId: integer('customer_id').notNull().references(() => customers.id),
    orderedAt: timestamp('ordered_at').notNull(),
    total: numeric('total', { precision: 12, scale: 2 }).notNull(),
  },
  (t) => [index('orders_customer_idx').on(t.customerId, t.orderedAt)],
);

// ---- Resultados del modelo (nuevas) ----
export const modelRuns = pgTable('model_runs', {
  id: serial('id').primaryKey(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  type: text('type').notNull(),            // 'segmentation' | 'clv' | 'churn'
  params: jsonb('params'),                 // k, ventana de tiempo, hiperparámetros
  metrics: jsonb('metrics'),               // silhouette, AUC, MAE, etc.
  cutoffDate: timestamp('cutoff_date'),    // fecha de corte usada para entrenar
  isActive: boolean('is_active').default(false).notNull(),
});

export const segments = pgTable('segments', {
  id: serial('id').primaryKey(),
  modelRunId: integer('model_run_id').notNull().references(() => modelRuns.id, { onDelete: 'cascade' }),
  clusterIndex: integer('cluster_index').notNull(),
  name: text('name').notNull(),            // 'Campeones', 'En riesgo', etc.
  centroid: jsonb('centroid'),
  size: integer('size').notNull(),
});

export const customerMetrics = pgTable(
  'customer_metrics',
  {
    customerId: integer('customer_id').notNull().references(() => customers.id),
    modelRunId: integer('model_run_id').notNull().references(() => modelRuns.id, { onDelete: 'cascade' }),
    recency: integer('recency').notNull(),
    frequency: integer('frequency').notNull(),
    monetary: numeric('monetary', { precision: 12, scale: 2 }).notNull(),
    rfmScore: text('rfm_score'),
    segmentId: integer('segment_id').references(() => segments.id),
    clv12m: numeric('clv_12m', { precision: 12, scale: 2 }),
    churnProb: real('churn_prob'),
    pAlive: real('p_alive'),
  },
  (t) => [index('cm_run_idx').on(t.modelRunId), index('cm_customer_idx').on(t.customerId)],
);
