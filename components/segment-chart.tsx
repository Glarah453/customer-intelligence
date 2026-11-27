'use client';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Props = { data: { name: string; revenue: number }[] };

export default function SegmentChart({ data }: Props) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          {/* <XAxis type="number" tickFormatter={(v) => `£${Math.round(v / 1000)}k`} /> */}
          <XAxis type="number" tickFormatter={(v: number) =>
              v >= 1_000_000 ? `£${(v / 1_000_000).toFixed(1)}M` : `£${Math.round(v / 1000)}k`
            } 
          />
          <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12 }} />
          {/* <Tooltip formatter={(v: number) => `£${v.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`} /> */}
          <Tooltip
            formatter={(v) => `£${Number(v).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`}
          />
          <Bar dataKey="revenue" fill="#3b82f6" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
