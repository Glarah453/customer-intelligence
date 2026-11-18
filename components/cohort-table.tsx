import type { CohortRow } from '@/lib/cohorts';

function cellStyle(pct: number, month: number) {
  // mes 0 siempre es 100%: lo pintamos suave para que no apague al resto
  const alpha = month === 0 ? 0.25 : Math.min(1, pct / 40);
  return {
    backgroundColor: `rgba(37, 99, 235, ${alpha})`,
    color: alpha > 0.6 ? '#fff' : '#111827',
  };
}

export default function CohortTable({ data }: { data: CohortRow[] }) {
  const months = data[0]?.retention.length ?? 0;

  return (
    <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
      <table className="w-full min-w-[760px] border-collapse text-xs sm:text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="sticky left-0 z-10 bg-white px-3 py-2">Cohorte</th>
            <th className="px-3 py-2 text-right">Clientes</th>
            {Array.from({ length: months }, (_, m) => (
              <th key={m} className="px-2 py-2 text-center">M{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.cohort} className="border-t">
              <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium">{row.cohort}</td>
              <td className="px-3 py-2 text-right">{row.size.toLocaleString('en-GB')}</td>
              {row.retention.map((pct, m) =>
                pct === null ? (
                  <td key={m} className="bg-gray-50" />
                ) : (
                  <td key={m} className="px-2 py-2 text-center" style={cellStyle(pct, m)}>
                    {pct.toFixed(m === 0 ? 0 : 1)}%
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
