import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowUpRight, Database, Gauge, Layers3 } from 'lucide-react';
import { apiFetch, queryString } from '../lib/api';
import { formatCompact } from '../lib/format';
import type { PaidBlock, RangeState, WebBlock } from '../types';
import { HorizontalBars, TrendChart } from '../components/Charts';
import { Card, KpiCard, PageHeader, SectionHeading, StatusPill } from '../components/Ui';
import { DataErrorBanner, emptyPaid } from './shared';

interface OverviewResponse { paid:{meta:PaidBlock;tiktok:PaidBlock;google:PaidBlock}; web:{gsc:WebBlock;ga4:WebBlock}; meta:{generatedAt:string;dataPolicy:string} }
const emptyWeb=(source:string,accountId:string):WebBlock=>({source,accountId,available:false,freshness:null,totals:{},comparisonTotals:null,deltas:{},series:[],breakdown:[]});

function metric(block:PaidBlock,key:string){return block.kpis.find((k)=>k.metric===key)?.value??null;}
function comparisonMetric(block:PaidBlock,key:string){return block.kpis.find((k)=>k.metric===key)?.comparison??null;}

export function Overview({ range }: { range: RangeState }) {
  const query=useQuery({queryKey:['overview',range],queryFn:()=>apiFetch<OverviewResponse>(`/api/overview?${queryString(range)}`),retry:1});
  const data=query.data??{paid:{meta:emptyPaid('act_1372413011147906'),tiktok:emptyPaid('7575077837867335696'),google:emptyPaid('2762824884')},web:{gsc:emptyWeb('Google Search Console','sc-domain:jaecoo.id'),ga4:emptyWeb('Google Analytics 4','470554174')},meta:{generatedAt:'',dataPolicy:'Missing data is unavailable, never zero.'}};
  const impressions=Object.values(data.paid).reduce((sum,block)=>sum+(metric(block,'impressions')??0),0);
  const hasImpressions=Object.values(data.paid).some((block)=>metric(block,'impressions')!==null);
  const comparisonImpressions=Object.values(data.paid).reduce((sum,block)=>sum+(comparisonMetric(block,'impressions')??0),0);
  const hasComparisonImpressions=Object.values(data.paid).some((block)=>comparisonMetric(block,'impressions')!==null);
  const impressionDelta=hasImpressions&&hasComparisonImpressions&&comparisonImpressions? (impressions-comparisonImpressions)/comparisonImpressions:null;
  const clicks=Object.values(data.paid).reduce((sum,block)=>sum+(metric(block,'clicks')??0),0);
  const hasClicks=Object.values(data.paid).some((block)=>metric(block,'clicks')!==null);
  const comparisonClicks=Object.values(data.paid).reduce((sum,block)=>sum+(comparisonMetric(block,'clicks')??0),0);
  const clickDelta=hasClicks&&comparisonClicks? (clicks-comparisonClicks)/comparisonClicks:null;
  const bars=Object.entries(data.paid).map(([label,block])=>({label:label==='google'?'Google Ads':label[0].toUpperCase()+label.slice(1),value:metric(block,'impressions')??0})).filter((d)=>d.value>0);
  const seriesByDate=new Map<string,{date:string;impressions:number;clicks:number}>();
  for(const block of Object.values(data.paid)) for(const point of block.series){
    const date=String(point.date);const item=seriesByDate.get(date)??{date,impressions:0,clicks:0};
    item.impressions+=Number(point.impressions??0);item.clicks+=Number(point.clicks??0);seriesByDate.set(date,item);
  }
  const crossChannelSeries=[...seriesByDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
  const coverage=[...Object.entries(data.paid).map(([source,block])=>({source:`${source[0].toUpperCase()+source.slice(1)} paid`,account:block.accountId,status:block.available?'Available':'Awaiting backfill',freshness:block.freshness?.latestReportDate??'Unavailable'})),{source:'Search Console',account:data.web.gsc.accountId,status:data.web.gsc.available?'Available':'Awaiting sync',freshness:'—'},{source:'GA4',account:data.web.ga4.accountId,status:data.web.ga4.available?'Available':'Awaiting sync',freshness:'—'}];
  return <><PageHeader eyebrow="Executive overview" title="Marketing performance, without blind spots" description="A single view across paid delivery, owned demand and website activity. Every number carries its source and reporting state." aside={<div className="hero-badge"><Gauge size={18}/><div><strong>Live range engine</strong><span>Asia/Jakarta · DB reads only</span></div></div>}/><DataErrorBanner message={query.error?.message}/>
    <div className="kpi-grid four overview-kpis"><KpiCard label="Paid impressions" metric="impressions" value={hasImpressions?impressions:null} delta={impressionDelta} accent="indigo"/><KpiCard label="Paid clicks" metric="clicks" value={hasClicks?clicks:null} delta={clickDelta} accent="blue"/><KpiCard label="Organic search clicks" metric="clicks" value={data.web.gsc.totals.clicks} delta={data.web.gsc.deltas.clicks} accent="teal"/><KpiCard label="Website sessions" metric="sessions" value={data.web.ga4.totals.sessions} delta={data.web.ga4.deltas.sessions} accent="orange"/></div>
    <div className="insight-ribbon"><div className="ribbon-icon"><Activity size={21}/></div><div><span>Decision signal</span><strong>{hasImpressions?'Paid delivery is active in the selected window.':'Paid history is awaiting a verified WAC backfill.'}</strong><p>{hasImpressions?`${formatCompact(impressions)} impressions delivered across ${bars.length} reporting channels.`:'Source gaps remain visible so a quiet dashboard cannot be mistaken for zero delivery.'}</p></div><ArrowUpRight size={20}/></div>
    <div className="split-grid wide-left"><Card><div className="card-head"><div><strong>Cross-channel movement</strong><span>Impressions and clicks from normalized daily facts</span></div><Layers3 size={18}/></div><TrendChart data={crossChannelSeries} primary="impressions" secondary="clicks"/></Card><Card><div className="card-head"><div><strong>Impressions by platform</strong><span>Selected window</span></div><Database size={18}/></div><HorizontalBars data={bars}/></Card></div>
    <section className="content-section"><SectionHeading kicker="Source integrity" title="Coverage & freshness" description="Unavailable history is never inferred. Open Settings for ingestion-level diagnostics."/><Card className="coverage-table"><table><thead><tr><th>Source</th><th>Asset</th><th>Coverage</th><th>Latest fact</th></tr></thead><tbody>{coverage.map((row)=><tr key={row.source}><td><strong>{row.source}</strong></td><td className="mono">{row.account}</td><td><StatusPill status={row.status==='Available'?'live':'unavailable'} label={row.status}/></td><td>{row.freshness}</td></tr>)}</tbody></table><div className="table-note"><span>{data.meta.dataPolicy}</span><span>{hasImpressions?formatCompact(impressions):'No paid fact rows'}</span></div></Card></section>
  </>;
}
