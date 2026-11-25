import SegmentChart from '@/components/segment-chart';
import { getChurn } from '@/lib/churn-data';

const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
const pct = (n: number, d = 0) => `${(n * 100).toFixed(d)}%`;

export default async function ChurnPage() {
  const d = await getChurn();
  if (!d) {
    return (
      <main className="p-6 text-sm text-gray-500">
        Faltan modelos entrenados: se necesitan churn y CLV activos.
      </main>
    );
  }

  const t = d.metrics.test;
  const high = d.bands.find((b) => b.band === 1);
  const avgPredicted = t.calibration.reduce((s, c) => s + c.predicted, 0) / t.calibration.length;

  const kpis = [
    { label: 'Clientes activos analizados', value: d.totals.customers.toLocaleString('en-GB') },
    { label: 'Con riesgo alto (≥70%)', value: (high?.customers ?? 0).toLocaleString('en-GB') },
    { label: 'CLV de clientes activos', value: gbp(d.totals.clv) },
    { label: 'Valor en riesgo', value: gbp(d.totals.atRisk) },
  ];

  const auc = [
    { label: 'Regresión logística', value: t.aucModel, bold: true },
    { label: 'Regla "más días sin comprar"', value: t.aucRecency, bold: false },
    { label: '1 − P(activo) del BG/NBD', value: t.aucBgNbd, bold: false },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-semibold sm:text-2xl">Riesgo de abandono</h1>
        <p className="text-sm text-gray-500">
          Regresión logística · activo = compró en los últimos {d.activeDays} días · abandono = sin compras en{' '}
          {d.horizonDays} días · corte al {d.cutoff}
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
          <h2 className="font-medium">CLV a 12 meses por nivel de riesgo</h2>
          <p className="mb-2 text-xs text-gray-500">Cuánto valor concentra cada grupo de clientes activos.</p>
          <SegmentChart data={d.bands.map((b) => ({ name: b.label, revenue: b.clv }))} />
        </div>

        <div className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
          <div>
            <h2 className="font-medium">Calidad del modelo</h2>
            <p className="text-xs text-gray-500">
              Evaluado en clientes activos al {t.cutoff} ({t.customers.toLocaleString('en-GB')} clientes), mirando los
              90 días siguientes.
            </p>
          </div>

          <table className="w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr><th className="py-1">Método</th><th className="text-right">AUC</th></tr>
            </thead>
            <tbody>
              {auc.map((a) => (
                <tr key={a.label} className="border-t">
                  <td className={`py-2 ${a.bold ? 'font-medium' : ''}`}>{a.label}</td>
                  <td className={`text-right ${a.bold ? 'font-medium' : ''}`}>{a.value.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="text-sm text-gray-600">
            En el 20% de clientes con mayor riesgo abandona el <b>{pct(t.precision20)}</b> (promedio general{' '}
            {pct(t.baseRate)}): lift de <b>{t.lift20}</b>. Esa lista cubre el <b>{pct(t.recall20)}</b> de todos los
            abandonos.
          </p>

          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
            El puntaje ordena bien a los clientes, pero tiende a sobreestimar la probabilidad: en la prueba predijo{' '}
            {pct(avgPredicted)} frente a un {pct(t.baseRate)} real, probablemente por la estacionalidad (sep-dic es
            temporada alta). Úsalo para priorizar, no como probabilidad exacta; el valor en riesgo es una cota alta.
          </p>
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="font-medium">Clientes a contactar primero</h2>
        <p className="mb-2 text-xs text-gray-500">Ordenados por valor en riesgo = puntaje de abandono × CLV a 12 meses.</p>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="py-1">Cliente</th>
              <th>País</th>
              <th>Días sin comprar</th>
              <th>Órdenes</th>
              <th>Riesgo</th>
              <th>CLV 12 m</th>
              <th className="text-right">Valor en riesgo</th>
            </tr>
          </thead>
          <tbody>
            {d.top.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="py-2 font-medium">#{c.id}</td>
                <td>{c.country}</td>
                <td>{c.recency}</td>
                <td>{c.orders}</td>
                <td>{pct(c.risk)}</td>
                <td>{gbp(c.clv)}</td>
                <td className="text-right">{gbp(c.at_risk)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="font-medium">Calibración por decil de riesgo</h2>
        <p className="mb-2 text-xs text-gray-500">Decil 1 = clientes de mayor riesgo. Compara lo predicho con lo que ocurrió.</p>
        <table className="w-full min-w-[420px] text-sm">
          <thead className="text-left text-gray-500">
            <tr><th className="py-1">Decil</th><th>Clientes</th><th>Predicho</th><th className="text-right">Real</th></tr>
          </thead>
          <tbody>
            {t.calibration.map((c) => (
              <tr key={c.decile} className="border-t">
                <td className="py-2">{c.decile}</td>
                <td>{c.customers}</td>
                <td>{pct(c.predicted)}</td>
                <td className="text-right">{pct(c.actual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <details className="rounded-xl border bg-white p-4 shadow-sm">
        <summary className="cursor-pointer font-medium">Qué influye en el riesgo (pesos del modelo)</summary>
        <p className="mt-2 text-xs text-gray-500">
          Positivo = aumenta el riesgo. Algunas variables miden cosas parecidas (recencia, retraso y órdenes
          recientes), así que cada peso no debe leerse por separado.
        </p>
        <table className="mt-2 w-full text-sm">
          <tbody>
            {d.metrics.weights.map((w) => (
              <tr key={w.feature} className="border-t">
                <td className="py-2">{w.feature}</td>
                <td className="text-right">{w.peso > 0 ? '+' : ''}{w.peso.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </main>
  );
}
