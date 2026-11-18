import SegmentChart from '@/components/segment-chart';
import { getRfmDashboard } from '@/lib/dashboard';

export default async function Page() {
  const data = await getRfmDashboard();

  if (!data) {
    return <main className="p-6">Aún no hay un modelo entrenado.</main>;
  }

  const { segs, cutoff } = data;
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

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-semibold sm:text-2xl">Customer Intelligence</h1>
        <p className="text-sm text-gray-500">Segmentación RFM · corte al {cutoff}</p>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">{k.label}</p>
            <p className="mt-1 text-lg font-semibold sm:text-2xl">{k.value}</p>
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
              <tr><th className="py-1">Segmento</th><th>Clientes</th><th>% base</th><th className="text-right">Ingresos</th></tr>
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
