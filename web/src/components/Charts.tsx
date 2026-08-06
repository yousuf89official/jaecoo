import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCompact } from '../lib/format';
import { EmptyState } from './Ui';

const colors = ['#283b8f', '#4263d7', '#18a17f', '#f59f38', '#e45d70', '#8a67d5'];

const tooltipStyle = { background: '#111827', border: '0', borderRadius: 12, color: '#fff', fontSize: 12 };

export function TrendChart({ data, primary = 'impressions', secondary, height = 280 }: { data: Array<Record<string, unknown>>; primary?: string; secondary?: string; height?: number }) {
  if (!data.length) return <EmptyState message="Run the database backfill to populate this time series. Empty history is not treated as zero." />;
  return <div style={{ height }}><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
    <defs><linearGradient id={`fill-${primary}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4263d7" stopOpacity={0.28}/><stop offset="100%" stopColor="#4263d7" stopOpacity={0.02}/></linearGradient></defs>
    <CartesianGrid stroke="#e9edf4" vertical={false}/><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#7b8494', fontSize: 11 }} minTickGap={28}/><YAxis tickLine={false} axisLine={false} tickFormatter={formatCompact} tick={{ fill: '#7b8494', fontSize: 11 }} width={62}/>
    <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCompact(Number(v))}/><Legend iconType="circle" iconSize={7}/>
    <Area type="monotone" dataKey={primary} stroke="#4263d7" strokeWidth={2.5} fill={`url(#fill-${primary})`} connectNulls/>
    {secondary && <Line type="monotone" dataKey={secondary} stroke="#18a17f" strokeWidth={2} dot={false} connectNulls/>}
  </AreaChart></ResponsiveContainer></div>;
}

export function HorizontalBars({ data, dataKey = 'value', nameKey = 'label', height = 260 }: { data: Array<Record<string, unknown>>; dataKey?: string; nameKey?: string; height?: number }) {
  if (!data.length) return <EmptyState compact message="No ranked data is available for this selection." />;
  return <div style={{ height }}><ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ left: 12, right: 26 }}>
    <CartesianGrid stroke="#e9edf4" horizontal={false}/><XAxis type="number" hide/><YAxis type="category" dataKey={nameKey} width={100} tickLine={false} axisLine={false} tick={{ fill: '#596273', fontSize: 11 }}/><Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCompact(Number(v))}/><Bar dataKey={dataKey} radius={[0, 7, 7, 0]} barSize={14}>{data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]}/>)}</Bar>
  </BarChart></ResponsiveContainer></div>;
}

export function Donut({ data, valueKey = 'value', nameKey = 'name', centerLabel }: { data: Array<Record<string, unknown>>; valueKey?: string; nameKey?: string; centerLabel: string }) {
  if (!data.length) return <EmptyState compact message="No comparison-set snapshot is available." />;
  return <div className="donut-wrap"><ResponsiveContainer width="100%" height={250}><PieChart><Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius={72} outerRadius={98} paddingAngle={2} stroke="none">{data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]}/>)}</Pie><Tooltip contentStyle={tooltipStyle}/><Legend iconType="circle" iconSize={7}/></PieChart></ResponsiveContainer><span className="donut-label">{centerLabel}</span></div>;
}

export function MultiLine({ data, keys, height = 280 }: { data: Array<Record<string, unknown>>; keys: string[]; height?: number }) {
  if (!data.length) return <EmptyState message="Daily snapshots will create this trend after ingestion runs more than once." />;
  return <div style={{ height }}><ResponsiveContainer><LineChart data={data}><CartesianGrid stroke="#e9edf4" vertical={false}/><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#7b8494', fontSize: 11 }}/><YAxis tickLine={false} axisLine={false} tickFormatter={formatCompact} tick={{ fill: '#7b8494', fontSize: 11 }}/><Tooltip contentStyle={tooltipStyle}/><Legend iconType="circle" iconSize={7}/>{keys.map((key, i) => <Line key={key} dataKey={key} stroke={colors[i % colors.length]} strokeWidth={2.2} dot={false}/>)}</LineChart></ResponsiveContainer></div>;
}
