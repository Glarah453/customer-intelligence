import Link from 'next/link';
import SegmentChart from '@/components/segment-chart';
import { getDashboard, type ModelType } from '@/lib/dashboard';

const tabs: { href: string; model: ModelType; label: string }[] = [
  { href: '/', model: 'rfm', label: 'RFM (reglas)' },
  { href: '/kmeans', model: 'kmeans', label: 'K-Means' },
];

export default async function SegmentsView({ model }: { model: ModelType }) {
  const data = await getDashboard(model);

  const toggle = (
    <div className="inline-flex rounded-lg border bg-white p-1 text-sm">
      {tabs.map((t) => (
        <Link
          key={t.model}
          href={t.href}
          className={`rounded-md px-3 py-1.5 ${
            t.model === model ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );

  if (!data) {
    return (
      <main className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        {toggle}
        <p className="text-sm text-gray-500">Aún no hay un modelo {model} entrenado.</p>
      </main>
    );
  }

  const { segs, cutoff, k, silhouette } = data;
  const customers = segs.reduce((s, x) => s + x.size, 0);
  const revenue = segs.reduce((s, x) => s + x.revenue, 0);
  const orders = segs.reduce((s, x) => s + x.orders, 0);
  const gbp = (n: number) => `£${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;

  const kpis = [
    { label: 'Clientes', value: customers.toLocaleString('en-GB') },
    { label: 'Ingresos', value: gbp(revenue) },
    { label: 'Órdenes', value: orders.toLocaleString('en-GB') },
    { label: 'Ticket promedio', value: gbp(revenue / orders) },
  ];

  const subtitle =
    model === 'kmeans'
      ? `K-Means · k=${k} · silhouette ${silhouette?.toFixed(3)} · corte al ${cutoff}`
      : `Segmentación RFM · corte al ${cutoff}`;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Customer Intelligence</h1>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
        {toggle}
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">{kpi.label}</p>
            <p className="mt-1 text-lg font-semibold sm:text-2xl">{kpi.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-medium">Ingresos por segmento</h2>
          <SegmentChart data={segs.map((s) => ({ name: s.name, revenue: s.revenue }))} />
        </div>

        <div className="overflow-x-auto rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-medium">Detalle</h2>
          <table className="w-full min-w-[320px] text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="py-1">Segmento</th>
                <th>Clientes</th>
                <th>% base</th>
                <th className="text-right">Ingresos</th>
              </tr>
            </thead>
            <tbody>
              {segs.map((s) => (
                <tr key={s.name} className="border-t">
                  <td className="py-2">{s.name}</td>
                  <td>{s.size.toLocaleString('en-GB')}</td>
                  <td>{((s.size / customers) * 100).toFixed(1)}%</td>
                  <td className="text-right">{gbp(s.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
