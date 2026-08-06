import type { ReactNode } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, DatabaseZap, Info, LockKeyhole, Minus, RefreshCw } from 'lucide-react';
import { formatMetric, titleCase } from '../lib/format';

export function PageHeader({ eyebrow, title, description, aside }: { eyebrow: string; title: string; description: string; aside?: ReactNode }) {
  return <div className="page-header">
    <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>
    {aside && <div className="page-header-aside">{aside}</div>}
  </div>;
}

export function SectionHeading({ kicker, title, description, action }: { kicker?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="section-heading">
    <div>{kicker && <p className="section-kicker">{kicker}</p>}<h2>{title}</h2>{description && <p>{description}</p>}</div>
    {action}
  </div>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function StatusPill({ status, label }: { status: 'live' | 'partial' | 'unavailable' | 'warning' | 'seeded'; label?: string }) {
  return <span className={`status-pill ${status}`}><span className="status-dot" />{label ?? status}</span>;
}

export function KpiCard({ label, metric, value, delta, hint, accent = 'indigo' }: {
  label: string; metric: string; value: number | null | undefined; delta?: number | null; hint?: string; accent?: string;
}) {
  const deltaUp = delta !== null && delta !== undefined && delta > 0;
  const deltaDown = delta !== null && delta !== undefined && delta < 0;
  const Icon = deltaUp ? ArrowUpRight : deltaDown ? ArrowDownRight : Minus;
  return <Card className={`kpi-card accent-${accent}`}>
    <div className="kpi-top"><span>{label}</span><span className="kpi-spark" /></div>
    <strong className={value === null || value === undefined ? 'is-unavailable' : ''}>{formatMetric(metric, value)}</strong>
    <div className="kpi-footer">
      {delta !== null && delta !== undefined ? <span className={deltaUp ? 'delta positive' : deltaDown ? 'delta negative' : 'delta'}><Icon size={13} />{Math.abs(delta * 100).toFixed(1)}%</span> : <span className="delta muted">No comparison</span>}
      <span>{hint ?? 'Selected range'}</span>
    </div>
  </Card>;
}

export function EmptyState({ title = 'Awaiting connected data', message, compact = false }: { title?: string; message: string; compact?: boolean }) {
  return <div className={`empty-state ${compact ? 'compact' : ''}`}>
    <div className="empty-icon"><DatabaseZap size={20} /></div><div><strong>{title}</strong><p>{message}</p></div>
  </div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <Card className="error-state"><AlertTriangle size={22} /><div><strong>Dashboard API unavailable</strong><p>{message}</p></div>{onRetry && <button className="button secondary" onClick={onRetry}><RefreshCw size={14} /> Retry</button>}</Card>;
}

export function Notice({ type = 'info', title, children }: { type?: 'info' | 'warning' | 'secure'; title: string; children: ReactNode }) {
  const Icon = type === 'warning' ? AlertTriangle : type === 'secure' ? LockKeyhole : Info;
  return <div className={`notice ${type}`}><Icon size={18} /><div><strong>{title}</strong><div>{children}</div></div></div>;
}

export function MetricTable({ rows, emptyMessage = 'No rows are available for this range.' }: { rows: Array<Record<string, unknown>>; emptyMessage?: string }) {
  if (!rows.length) return <EmptyState compact message={emptyMessage} />;
  const columns = Object.keys(rows[0]).filter((key) => !['id', 'objective'].includes(key)).slice(0, 7);
  return <div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{titleCase(column)}</th>)}</tr></thead><tbody>
    {rows.map((row, index) => <tr key={String(row.id ?? index)}>{columns.map((column) => <td key={column}>{typeof row[column] === 'number' ? formatMetric(column, row[column] as number) : String(row[column] ?? '—')}</td>)}</tr>)}
  </tbody></table></div>;
}
