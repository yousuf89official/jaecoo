import { useEffect, useState } from 'react';
import { Activity, BarChart3, CalendarDays, ChevronDown, CircleGauge, Database, Facebook, Globe2, Menu, Search, Settings2, Share2, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { CompareKey, NavKey, RangeKey, RangeState } from '../types';
import { StatusPill } from './Ui';

const nav: Array<{ key: NavKey; label: string; icon: typeof Activity }> = [
  { key: 'overview', label: 'Overview', icon: CircleGauge },
  { key: 'meta', label: 'Meta (FB / IG)', icon: Facebook },
  { key: 'tiktok', label: 'TikTok', icon: Activity },
  { key: 'google', label: 'Google & Web', icon: Globe2 },
  { key: 'sov', label: 'Share of Voice', icon: Share2 },
  { key: 'competitors', label: 'Competitors', icon: BarChart3 },
  { key: 'trends', label: 'Google Trends', icon: Search },
];

export function Sidebar({ active, onChange }: { active: NavKey; onChange: (key: NavKey) => void }) {
  const [open, setOpen] = useState(false);
  const choose = (key: NavKey) => { onChange(key); setOpen(false); };
  return <><button aria-label="Open menu" className="mobile-menu" onClick={() => setOpen(true)}><Menu size={20}/></button>{open && <button aria-label="Dismiss menu" className="sidebar-scrim" onClick={() => setOpen(false)}/>}<aside className={`sidebar ${open ? 'open' : ''}`}>
    <div className="brand-lockup"><div className="brand-mark"><span>J</span></div><div><strong>JAECOO</strong><small>Marketing Intelligence</small></div><button aria-label="Close sidebar" className="mobile-close" onClick={() => setOpen(false)}><X size={18}/></button></div>
    <div className="workspace-chip"><span>JI</span><div><strong>Jaecoo Indonesia</strong><small>All connected accounts</small></div><ChevronDown size={14}/></div>
    <nav><p className="nav-label">Intelligence</p>{nav.map((item) => <button className={active === item.key ? 'active' : ''} key={item.key} onClick={() => choose(item.key)}><item.icon size={18}/><span>{item.label}</span>{item.key === 'meta' || item.key === 'tiktok' ? <i className="nav-status pending"/> : null}</button>)}</nav>
    <div className="sidebar-bottom"><p className="nav-label">Operations</p><button className={active === 'health' ? 'active' : ''} onClick={() => choose('health')}><Database size={18}/><span>Data health</span></button><div className="system-card"><div><ShieldCheck size={17}/><span>Read-only reporting</span></div><p>Campaign delivery controls are excluded from this app.</p></div><div className="user-row"><span className="user-avatar">W</span><div><strong>WAC Intelligence</strong><small>Owner workspace</small></div><Settings2 size={16}/></div></div>
  </aside></>;
}

const presets: Array<{ key: RangeKey; label: string }> = [
  {key:'7',label:'7D'},{key:'14',label:'14D'},{key:'30',label:'30D'},{key:'60',label:'60D'},{key:'90',label:'90D'},{key:'180',label:'180D'},{key:'mtd',label:'MTD'},{key:'ytd',label:'YTD'},{key:'custom',label:'Custom'},
];

export function Topbar({ range, onChange, loading, freshness }: { range: RangeState; onChange: (range: RangeState) => void; loading: boolean; freshness: { status: 'live' | 'partial' | 'unavailable' | 'seeded'; label: string } }) {
  const [draftStart, setDraftStart] = useState(range.start ?? '');
  const [draftEnd, setDraftEnd] = useState(range.end ?? '');
  const [customOpen, setCustomOpen] = useState(range.range === 'custom');
  useEffect(() => { setDraftStart(range.start ?? ''); setDraftEnd(range.end ?? ''); }, [range.start, range.end]);
  return <header className="topbar">
    <div className="topbar-label"><CalendarDays size={16}/><span>Reporting window</span></div>
    <div className="range-pills">{presets.map((preset) => <button key={preset.key} className={(preset.key === 'custom' ? customOpen : range.range === preset.key) ? 'active' : ''} onClick={() => { if (preset.key === 'custom') setCustomOpen(true); else { setCustomOpen(false); onChange({ ...range, range: preset.key, start: undefined, end: undefined }); } }}>{preset.label}</button>)}</div>
    {customOpen && <div className="custom-range"><input aria-label="Custom start date" type="date" value={draftStart} onChange={(event) => setDraftStart(event.target.value)}/><span>to</span><input aria-label="Custom end date" type="date" value={draftEnd} onChange={(event) => setDraftEnd(event.target.value)}/><button disabled={!draftStart || !draftEnd || draftStart > draftEnd} onClick={() => onChange({...range,range:'custom',start:draftStart,end:draftEnd})}>Apply</button></div>}
    <div className="comparison"><span>Compare</span><select value={range.cmp} onChange={(event) => onChange({...range,cmp:event.target.value as CompareKey})}><option value="prev">Previous period</option><option value="yoy">Previous year</option><option value="none">No comparison</option></select></div>
    <div className="freshness-live"><StatusPill status={loading ? 'partial' : freshness.status} label={loading ? 'refreshing DB' : freshness.label}/></div>
  </header>;
}

export function AppChrome({ children, active, onNav, range, onRange, loading, freshness }: { children: React.ReactNode; active: NavKey; onNav: (key: NavKey) => void; range: RangeState; onRange: (range: RangeState) => void; loading: boolean; freshness: { status: 'live' | 'partial' | 'unavailable' | 'seeded'; label: string } }) {
  return <div className="app-shell"><Sidebar active={active} onChange={onNav}/><div className="main-shell"><Topbar range={range} onChange={onRange} loading={loading} freshness={freshness}/><main>{children}</main><footer><span>JAECOO Indonesia · Marketing Intelligence</span><span><Sparkles size={13}/> Database-backed reporting · Asia/Jakarta</span></footer></div></div>;
}
