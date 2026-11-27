import SegmentChart from '@/components/segment-chart';
import { BucketChart, MonthlyChart, ParetoChart } from '@/components/eda-charts';
import { getEda, type StatKey } from '@/lib/eda';

const num = (n: number, d = 0) => n.toLocaleString('en-GB', { maximumFractionDigits: d });
const money = (n: number) =>
  n >= 1_000_000 ? `£${(n / 1_000_000).toFixed(1)}M` : `£${num(n)}`;

const STAT_META: Record<StatKey, { label: string; money: boolean }> = {
  order_value: { label: 'Valor por orden', money: true },
  orders_per_customer: { label: 'Órdenes por cliente', money: false },
  spend_per_customer: { label: 'Gasto por cliente', money: true },
};

export default async function DatosPage() {
  const d = await getEda();
  const s = d.summary;

  const kpis = [
    { label: 'Clientes', value: num(s.customers) },
    { label: 'Órdenes', value: num(s.orders) },
    { label: 'Ingresos totales', value: money(s.revenue) },
    { label: 'Ticket promedio', value: `£${num(s.avg_ticket)}` },
    { label: 'Período', value: `${s.first_day} → ${s.last_day}`, small: true },
    { label: 'Países', value: num(s.countries) },
  ];

  const fmt = (n: number, isMoney: boolean) => (isMoney ? `£${num(n)}` : num(n, 1));

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-semibold sm:text-2xl">Análisis exploratorio</h1>
        <p className="text-sm text-gray-500">
          Online Retail II (UCI Machine Learning Repository) · ventas de un minorista online · agregadas por
          factura
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">{k.label}</p>
            <p className={`mt-1 font-semibold ${k.small ? 'text-base sm:text-lg' : 'text-lg sm:text-2xl'}`}>
              {k.value}
            </p>
          </div>
        ))}
      </section>

      <section className="overflow-x-auto rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="font-medium">Estadísticos principales</h2>
        <p className="mb-2 text-xs text-gray-500">
          Cuando la media está muy por encima de la mediana, unos pocos valores muy altos (mayoristas) arrastran el
          promedio. Por eso los modelos trabajan con logaritmos y el CLV tiene casos atípicos.
        </p>
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="py-1">Variable</th>
              <th>Media</th>
              <th>Mediana</th>
              <th>Percentil 90</th>
              <th>Máximo</th>
              <th className="text-right">Media ÷ mediana</th>
            </tr>
          </thead>
          <tbody>
            {d.stats.map((r) => {
              const meta = STAT_META[r.stat];
              return (
                <tr key={r.stat} className="border-t">
                  <td className="py-2 font-medium">{meta.label}</td>
                  <td>{fmt(r.mean, meta.money)}</td>
                  <td>{fmt(r.median, meta.money)}</td>
                  <td>{fmt(r.p90, meta.money)}</td>
                  <td>{fmt(r.max_value, meta.money)}</td>
                  <td className="text-right">{r.median > 0 ? `${(r.mean / r.median).toFixed(1)}×` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="font-medium">Ingresos por mes</h2>
        <p className="mb-2 text-xs text-gray-500">
          El último mes está incompleto: los datos terminan el {s.last_day}. La estacionalidad (temporada alta hacia
          fin de año) influye en la retención de las cohortes y en la calibración del modelo de churn.
        </p>
        <MonthlyChart data={d.monthly} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="font-medium">Clientes según número de órdenes</h2>
          <p className="mb-2 text-xs text-gray-500">
            Cuántos clientes hicieron 1, 2, 3 a 5… compras en todo el período.
          </p>
          <BucketChart data={d.buckets} />
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="font-medium">Ingresos por país</h2>
          <p className="mb-2 text-xs text-gray-500">
            El Reino Unido concentra el {(d.ukShare * 100).toFixed(0)}% de los ingresos.
          </p>
          <SegmentChart data={d.countries.map((c) => ({ name: c.name, revenue: c.revenue }))} />
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="font-medium">Concentración de ingresos</h2>
        <p className="mb-2 text-xs text-gray-500">
          El 10% de los clientes que más gastan genera el <b>{d.top10Share.toFixed(0)}%</b> de los ingresos, y el 20%
          genera el <b>{d.top20Share.toFixed(0)}%</b>. La línea punteada sería un reparto perfectamente igualitario.
        </p>
        <ParetoChart data={d.pareto} />
      </section>

      <p className="text-xs text-gray-400">
        Fuente: Online Retail II, UCI Machine Learning Repository. Se excluyeron cancelaciones, registros sin cliente
        y líneas con cantidad o precio menor o igual a cero. Cada fila de órdenes corresponde a una factura (las líneas
        de producto se agregaron), por lo que no hay análisis por producto.
      </p>
    </main>
  );
}
