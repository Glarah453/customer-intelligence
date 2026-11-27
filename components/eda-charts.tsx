'use client';

import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

const money = (v: number) =>
  v >= 1_000_000 ? `£${(v / 1_000_000).toFixed(1)}M` : `£${Math.round(v / 1000)}k`;

export function MonthlyChart({ data }: { data: { month: string; revenue: number }[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" tickFormatter={(m: string) => m.slice(2)} tick={{ fontSize: 11 }} minTickGap={12} />
          <YAxis width={52} tickFormatter={money} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(v) => `£${Number(v).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`}
          />
          <Bar dataKey="revenue" name="Ingresos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BucketChart({ data }: { data: { bucket: string; customers: number }[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
          <YAxis width={44} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => Number(v).toLocaleString('en-GB')} />
          <Bar dataKey="customers" name="Clientes" fill="#16a34a" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ParetoChart({ data }: { data: { pct: number; share: number; equal: number }[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="pct" type="number" domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} unit="%" />
          <YAxis width={48} domain={[0, 100]} unit="%" />
          <Tooltip
            formatter={(v) => `${Number(v).toFixed(1)}%`}
            labelFormatter={(l) => `Top ${String(l)}% de clientes`}
          />
          <Legend />
          <Line dataKey="share" name="Ingresos acumulados" stroke="#2563eb" strokeWidth={2} dot={false} />
          <Line dataKey="equal" name="Reparto igualitario" stroke="#9ca3af" strokeDasharray="4 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
