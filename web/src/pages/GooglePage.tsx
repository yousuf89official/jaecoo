import { useQuery } from '@tanstack/react-query';
import { BarChart3, MousePointerClick, Search, UsersRound } from 'lucide-react';
import { apiFetch, queryString } from '../lib/api';
import { titleCase } from '../lib/format';
import type { PaidBlock, RangeState, WebBlock } from '../types';
import { HorizontalBars, TrendChart } from '../components/Charts';
import { Card, KpiCard, MetricTable, Notice, PageHeader, SectionHeading, StatusPill } from '../components/Ui';
import { DataErrorBanner, emptyPaid, PaidMetrics } from './shared';

interface GoogleResponse {paid:PaidBlock;gsc:WebBlock;ga4:WebBlock}
const emptyWeb=(source:string,accountId:string):WebBlock=>({source,accountId,available:false,freshness:null,totals:{},comparisonTotals:null,deltas:{},series:[],breakdown:[]});

function WebSection({data,type}:{data:WebBlock;type:'gsc'|'ga4'}){
  const metrics=type==='gsc'?['clicks','impressions','ctr','position']:['sessions','users','pageviews','key_events'];
  const dimensions=data.breakdown.filter((row)=>row.type=== (type==='gsc'?'query':'channel')).slice(0,10).map((row)=>({label:row.label,value:row.value??0}));
  return <section className="content-section"><SectionHeading kicker={type==='gsc'?'02 · Earned demand':'03 · On-site behaviour'} title={type==='gsc'?'Google Search Console':'Google Analytics 4'} description={type==='gsc'?'Search demand, visibility and query intent from sc-domain:jaecoo.id.':'Sessions, users and acquisition mix for GA4 property 470554174.'} action={<div className="source-badges"><StatusPill status={data.available?'live':'unavailable'} label={data.available?'data available':'awaiting sync'}/>{data.freshness && <StatusPill status={data.freshness.states.includes('partial')?'partial':'live'} label={data.freshness.latestReportDate}/>}</div>}/>
    <div className="kpi-grid four">{metrics.map((metric,index)=><KpiCard key={metric} label={titleCase(metric)} metric={metric} value={data.totals[metric]} delta={data.deltas[metric]} accent={['indigo','blue','teal','orange'][index]}/>)}</div>
    {type==='ga4' && !data.totals.key_events && <Notice type="warning" title="Conversion definition unavailable"><p>No trusted key-event data is stored for this window. Configure test-drive, WhatsApp, dealer-locator and brochure events before using lower-funnel reporting.</p></Notice>}
    <div className="split-grid wide-left"><Card><div className="card-head"><div><strong>{type==='gsc'?'Clicks & impressions':'Sessions & users'}</strong><span>Daily for ≤62 days, monthly for longer windows</span></div>{type==='gsc'?<MousePointerClick size={18}/>:<UsersRound size={18}/>}</div><TrendChart data={data.series} primary={type==='gsc'?'clicks':'sessions'} secondary={type==='gsc'?'impressions':'users'}/></Card><Card><div className="card-head"><div><strong>{type==='gsc'?'Top queries':'Channel mix'}</strong><span>Selected window</span></div><BarChart3 size={18}/></div><HorizontalBars data={dimensions}/></Card></div>
    <Card><div className="card-head"><div><strong>{type==='gsc'?'Query and page details':'Acquisition details'}</strong><span>Source-dimension rows from the database</span></div><Search size={18}/></div><MetricTable rows={data.breakdown as unknown as Array<Record<string,unknown>>}/></Card>
  </section>;
}

export function GooglePage({range}:{range:RangeState}){
  const query=useQuery({queryKey:['google',range],queryFn:()=>apiFetch<GoogleResponse>(`/api/google?${queryString(range)}`),retry:1});
  const data=query.data??{paid:emptyPaid('2762824884'),gsc:emptyWeb('Google Search Console','sc-domain:jaecoo.id'),ga4:emptyWeb('Google Analytics 4','470554174')};
  return <><PageHeader eyebrow="Google & Web" title="Demand to destination" description="Paid search, organic demand and website behaviour shown as distinct systems—without collapsing missing attribution into a blended total."/><DataErrorBanner message={query.error?.message}/><PaidMetrics data={data.paid} platform="Google Ads"/><WebSection data={data.gsc} type="gsc"/><WebSection data={data.ga4} type="ga4"/></>;
}
