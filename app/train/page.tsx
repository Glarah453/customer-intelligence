import TrainForm from '@/components/train-form';
import { ClusterScatter, KChart } from '@/components/train-charts';
import { getTrainOverview } from '@/lib/train-data';

export default async function TrainPage() {
  const enabled = process.env.TRAINING_ENABLED === 'true';
  const data = await getTrainOverview();

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-semibold sm:text-2xl">Entrenar modelo</h1>
        <p className="text-sm text-gray-500">
          K-Means sobre RFM (log + estandarización) · selección de k por codo y silhouette
        </p>
      </header>

      <TrainForm enabled={enabled} />

      {!data ? (
        <p className="text-sm text-gray-500">Aún no hay un modelo K-Means entrenado.</p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Corrida activa', value: `#${data.runId}` },
              { label: 'k elegido', value: String(data.k) },
              { label: 'Silhouette', value: data.metrics.silhouette.toFixed(3) },
              { label: 'Inercia', value: data.metrics.inertia.toLocaleString('en-GB') },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-xl border bg-white p-4 shadow-sm">
                <p className="text-xs text-gray-500">{kpi.label}</p>
                <p className="mt-1 text-lg font-semibold sm:text-2xl">{kpi.value}</p>
              </div>
            ))}
          </section>
          <p className="-mt-3 text-xs text-gray-400">Entrenado el {data.createdAt}</p>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <h2 className="font-medium">Método del codo (inercia)</h2>
              <p className="mb-2 text-xs text-gray-500">Menor es mejor; buscamos dónde la mejora se aplana.</p>
              <KChart data={data.metrics.byK} k={data.k} dataKey="inertia" color="#2563eb" />
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <h2 className="font-medium">Silhouette por k</h2>
              <p className="mb-2 text-xs text-gray-500">Mayor es mejor; mide qué tan separados quedan los grupos.</p>
              <KChart data={data.metrics.byK} k={data.k} dataKey="silhouette" color="#16a34a" />
            </div>
          </section>

          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="font-medium">Clusters: recencia vs monto</h2>
            <p className="mb-2 text-xs text-gray-500">Muestra de 1.500 clientes · eje de monto en escala logarítmica.</p>
            <ClusterScatter
              points={data.points}
              clusters={data.segs.map((s) => ({ index: s.index, name: s.name }))}
            />
          </section>

          <section className="overflow-x-auto rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="mb-2 font-medium">Perfil de cada segmento</h2>
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-gray-500">
                <tr>
                  <th className="py-1">Segmento</th>
                  <th>Clientes</th>
                  <th>Recencia</th>
                  <th>Frecuencia</th>
                  <th className="text-right">Monto prom.</th>
                </tr>
              </thead>
              <tbody>
                {data.segs.map((s) => (
                  <tr key={s.index} className="border-t">
                    <td className="py-2 font-medium">{s.name}</td>
                    <td>{s.size.toLocaleString('en-GB')}</td>
                    <td>{Math.round(s.centroid.recency)} d</td>
                    <td>{s.centroid.frequency.toFixed(1)}</td>
                    <td className="text-right">£{Math.round(s.centroid.monetary).toLocaleString('en-GB')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}
