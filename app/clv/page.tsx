import SegmentChart from '@/components/segment-chart';
import { getClv } from '@/lib/clv-data';

const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
const signed = (n: number) => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;

export default async function ClvPage() {
  const d = await getClv();
  if (!d) {
    return <main className="p-6 text-sm text-gray-500">Aún no hay un modelo CLV entrenado.</main>;
  }

  const v = d.validation;
  const improvement = 1 - v.mae / v.maeBaseline;

  const kpis = [
    { label: 'CLV total a 12 meses', value: gbp(d.total) },
    { label: 'CLV promedio por cliente', value: gbp(d.avg) },
    { label: 'Top 10% concentra', value: `${(d.topDecileShare * 100).toFixed(0)}% del CLV` },
    { label: 'Error vs. ritmo histórico', value: `${(improvement * 100).toFixed(0)}% menor` },
  ];

  const validationRows = [
    { label: `Compras (${v.horizonWeeks} sem)`, pred: v.predictedPurchases, real: v.actualPurchases, fmt: (n: number) => n.toLocaleString('en-GB') },
    { label: `Ingresos (${v.horizonWeeks} sem)`, pred: v.predictedRevenue, real: v.actualRevenue, fmt: gbp },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-semibold sm:text-2xl">Customer Lifetime Value</h1>
        <p className="text-sm text-gray-500">
          BG/NBD + Gamma-Gamma · horizonte {d.horizonWeeks} semanas · corte al {d.cutoff}
        </p>
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
          <h2 className="font-medium">CLV por decil de clientes</h2>
          <p className="mb-2 text-xs text-gray-500">Decil 1 = el 10% de clientes con mayor CLV.</p>
          <SegmentChart data={d.deciles.map((x) => ({ name: `Decil ${x.d}`, revenue: x.clv }))} />
        </div>

        <div className="space-y-4 rounded-xl border bg-white p-4 shadow-sm">
          <div>
            <h2 className="font-medium">Validación con datos reales</h2>
            <p className="text-xs text-gray-500">
              Entrenado hasta {v.calibrationEnd} y comparado con las {v.horizonWeeks} semanas siguientes
              ({v.customers.toLocaleString('en-GB')} clientes).
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] text-sm">
              <thead className="text-left text-gray-500">
                <tr><th className="py-1"></th><th>Predicho</th><th>Real</th><th className="text-right">Diferencia</th></tr>
              </thead>
              <tbody>
                {validationRows.map((r) => (
                  <tr key={r.label} className="border-t">
                    <td className="py-2">{r.label}</td>
                    <td>{r.fmt(r.pred)}</td>
                    <td>{r.fmt(r.real)}</td>
                    <td className="text-right">{signed(r.pred / r.real - 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-sm text-gray-600">
            Error absoluto medio por cliente: <b>{v.mae}</b> (modelo) vs <b>{v.maeBaseline}</b> (ritmo histórico) ·
            correlación <b>{v.correlation}</b>.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] text-sm">
              <thead className="text-left text-gray-500">
                <tr><th className="py-1">Compras repetidas previas</th><th>Clientes</th><th>Predicho</th><th className="text-right">Real</th></tr>
              </thead>
              <tbody>
                {v.bands.map((b) => (
                  <tr key={b.label} className="border-t">
                    <td className="py-2">{b.label}</td>
                    <td>{b.customers.toLocaleString('en-GB')}</td>
                    <td>{b.predicted.toFixed(2)}</td>
                    <td className="text-right">{b.actual.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-xs text-gray-400">Compras promedio por cliente en el período de validación.</p>
          </div>
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-2 font-medium">Los 20 clientes de mayor CLV</h2>
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="py-1">Cliente</th>
              <th>País</th>
              <th>Órdenes</th>
              <th>Gasto histórico</th>
              <th>P(activo)</th>
              <th className="text-right">CLV 12 m</th>
            </tr>
          </thead>
          <tbody>
            {d.top.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="py-2 font-medium">#{c.id}</td>
                <td>{c.country}</td>
                <td>{c.orders}</td>
                <td>{gbp(c.spent)}</td>
                <td>{(c.p_alive * 100).toFixed(0)}%</td>
                <td className="text-right">{gbp(c.clv)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
