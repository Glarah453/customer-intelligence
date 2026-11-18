import CohortTable from '@/components/cohort-table';
import { getCohorts } from '@/lib/cohorts';

export default async function CohortsPage() {
  const data = await getCohorts();

  // retención promedio al mes 1, 3 y 6 (solo cohortes que ya tienen ese mes)
  // const avg = (m: number) => {
  //   const vals = data.map((r) => r.retention[m]).filter((v): v is number => v !== null);
  //   return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  // };
  
  const avg = (m: number) => {
    // slice(1): se excluye 2009-12, que mezcla clientes nuevos con preexistentes
    const rows = data.slice(1).filter((r) => r.retention[m] !== null);
    const total = rows.reduce((s, r) => s + r.size, 0);
    return total ? rows.reduce((s, r) => s + r.size * r.retention[m]!, 0) / total : 0;
  };

  const kpis = [
    { label: 'Retención mes 1', value: `${avg(1).toFixed(1)}%` },
    { label: 'Retención mes 3', value: `${avg(3).toFixed(1)}%` },
    { label: 'Retención mes 6', value: `${avg(6).toFixed(1)}%` },
    { label: 'Retención mes 12', value: `${avg(12).toFixed(1)}%` },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-semibold sm:text-2xl">Cohortes y retención</h1>
        <p className="text-sm text-gray-500">
          % de clientes de cada cohorte que volvió a comprar, por mes desde su primera compra
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

      <CohortTable data={data} />
    </main>
  );
}
