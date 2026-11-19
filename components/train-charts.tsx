'use client';

import {
  CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts';

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#0891b2', '#db2777', '#65a30d'];

export function KChart({
  data, k, dataKey, color,
}: {
  data: { k: number; inertia: number; silhouette: number }[];
  k: number;
  dataKey: 'inertia' | 'silhouette';
  color: string;
}) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="k" />
          <YAxis width={48} domain={['auto', 'auto']} />
          <Tooltip />
          <ReferenceLine x={k} stroke="#ef4444" strokeDasharray="4 4" />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ClusterScatter({
  points, clusters,
}: {
  points: { cluster: number; recency: number; monetary: number }[];
  clusters: { index: number; name: string }[];
}) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" dataKey="recency" name="Recencia" unit=" d" />
          <YAxis
            type="number"
            dataKey="monetary"
            name="Monto"
            scale="log"
            domain={['auto', 'auto']}
            width={52}
            tickFormatter={(v: number) => (v >= 1000 ? `£${Math.round(v / 1000)}k` : `£${Math.round(v)}`)}
          />
          <ZAxis range={[18, 18]} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} />
          <Legend />
          {clusters.map((c) => (
            <Scatter
              key={c.index}
              name={c.name}
              data={points.filter((p) => p.cluster === c.index)}
              fill={COLORS[c.index % COLORS.length]}
              fillOpacity={0.6}
              isAnimationActive={false}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
