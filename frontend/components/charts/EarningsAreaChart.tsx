'use client';

// Recharts wrapper isolated into its own module so `next/dynamic` can split
// it into a separate chunk. Saves ~90KB gzipped from the dashboard's initial
// JS payload because recharts is only loaded when the chart actually renders.
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

export interface EarningsAreaChartProps {
  data: Array<{ month: string; earnings: number }>;
}

export default function EarningsAreaChart({ data }: EarningsAreaChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06D4B8" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#06D4B8" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" vertical={false} />
        <XAxis
          dataKey="month"
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
          tickFormatter={(v) => `${v / 1000}k`}
        />
        <RechartsTooltip
          contentStyle={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--hairline)',
            borderRadius: '10px',
            boxShadow: '0 4px 20px rgba(15,23,42,0.08)',
            fontSize: 12,
            fontWeight: 600,
          }}
          labelStyle={{ color: 'hsl(var(--foreground))' }}
          formatter={(v: number) => [`$${v.toLocaleString()}`, 'Earnings']}
        />
        <Area
          type="monotone"
          dataKey="earnings"
          stroke="#06D4B8"
          strokeWidth={2.5}
          fill="url(#colorEarnings)"
          activeDot={{ r: 6, fill: '#06D4B8', stroke: 'white', strokeWidth: 3 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
