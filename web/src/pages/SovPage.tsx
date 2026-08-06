import { useQuery } from '@tanstack/react-query';
import { BookOpenCheck, Database, MapPin, Scale } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { queryString } from '../lib/api';
import { formatCompact, formatPercent } from '../lib/format';
import type { RangeState } from '../types';
import { Donut, HorizontalBars, MultiLine } from '../components/Charts';
import { Card, Notice, PageHeader, SectionHeading, StatusPill } from '../components/Ui';
import { DataErrorBanner } from './shared';

interface SovBrand {brand:string;popularity:number|null;mentions:number|null;share:number|null;shareExMg:number|null;shareDelta:number|null;shareExMgDelta:number|null}
interface SovResponse {available:boolean;source:string;latestSnapshot:string|null;comparisonSnapshot:string|null;methodology:string;caveat:string;brands:SovBrand[];mentions:Array<{brand:string;mentions:number|null}>;trend:Array<{date:string;brand:string;popularity:number|null}>}

export function SovPage({range}:{range:RangeState}){
  const query=useQuery({queryKey:['sov',range],queryFn:()=>apiFetch<SovResponse>(`/api/sov?${queryString(range)}`),retry:1});
  const data=query.data??{available:false,source:'Brand24 popularity index',latestSnapshot:null,comparisonSnapshot:null,methodology:'Rolling 30-day popularity index for Indonesia. Share is each brand index divided by the selected comparison set total; it is not total-market share.',caveat:'MG materially affects the denominator, so a second view excludes MG.',brands:[],mentions:[],trend:[]};
  const all=data.brands.filter((row)=>row.popularity!==null).map((row)=>({name:row.brand,value:row.popularity!}));
  const exMg=data.brands.filter((row)=>row.brand!=='MG'&&row.popularity!==null).map((row)=>({name:row.brand,value:row.popularity!}));
  const bars=data.brands.filter((row)=>row.popularity!==null).map((row)=>({label:row.brand,value:row.popularity!})).sort((a,b)=>b.value-a.value);
  const mentionBars=data.mentions.filter((row)=>row.mentions!==null).map((row)=>({label:row.brand,value:row.mentions!}));
  const dates=[...new Set(data.trend.map((row)=>row.date))];
  const trend=dates.map((date)=>Object.assign({date},...data.trend.filter((row)=>row.date===date&&row.popularity!==null).map((row)=>({[row.brand]:row.popularity!}))));
  const jaecoo=data.brands.find((brand)=>brand.brand==='Jaecoo');
  const deltaLabel=(value:number|null|undefined)=>value===null||value===undefined?'No comparison':`${value>=0?'▲':'▼'} ${Math.abs(value*100).toFixed(1)}%`;
  return <><PageHeader eyebrow="Market conversation" title="Share of Voice, with the denominator exposed" description="A transparent view of Brand24 popularity—not a claim about total market visibility." aside={<div className="hero-badge"><MapPin size={18}/><div><strong>Indonesia</strong><span>Rolling 30-day snapshot</span></div></div>}/><DataErrorBanner message={query.error?.message}/>
    <Notice type="info" title="Methodology"><p>{data.methodology}</p><div className="method-grid"><span><Database size={14}/> Source: {data.source}</span><span><Scale size={14}/> Formula: brand index ÷ comparison-set total</span><span><BookOpenCheck size={14}/> Snapshot: {data.latestSnapshot??'Unavailable'}</span></div></Notice>
    <section className="content-section"><SectionHeading kicker="Comparison sets" title="Two views, one disclosed caveat" description={data.caveat} action={<StatusPill status={data.available?'seeded':'unavailable'} label={data.available?`snapshot ${data.latestSnapshot}`:'awaiting snapshot'}/>}/><div className="split-grid equal"><Card><div className="card-head"><div><strong>All six brands</strong><span>Jaecoo · Chery · BYD · Wuling · Geely · MG</span></div></div><Donut data={all} centerLabel="All 6"/><div className="sov-highlight">Jaecoo <span className={jaecoo?.shareDelta===null?'delta muted':(jaecoo?.shareDelta??0)>=0?'delta positive':'delta negative'}>{deltaLabel(jaecoo?.shareDelta)}</span><strong>{formatPercent(jaecoo?.share)}</strong></div></Card><Card><div className="card-head"><div><strong>Excluding MG</strong><span>Analytical view for an inflated comparator</span></div></div><Donut data={exMg} centerLabel="Excl. MG"/><div className="sov-highlight">Jaecoo <span className={jaecoo?.shareExMgDelta===null?'delta muted':(jaecoo?.shareExMgDelta??0)>=0?'delta positive':'delta negative'}>{deltaLabel(jaecoo?.shareExMgDelta)}</span><strong>{formatPercent(jaecoo?.shareExMg)}</strong></div></Card></div></section>
    <div className="split-grid wide-left"><Card><div className="card-head"><div><strong>Popularity index</strong><span>Latest verified snapshot</span></div></div><HorizontalBars data={bars}/></Card><Card><div className="card-head"><div><strong>Tracked-project mentions</strong><span>Jaecoo · Geely · MG · Honda when available</span></div></div><HorizontalBars data={mentionBars}/></Card></div>
    <Card><div className="card-head"><div><strong>Snapshot trend</strong><span>Builds as daily snapshots accumulate</span></div></div><MultiLine data={trend} keys={data.brands.map((b)=>b.brand)}/></Card>
    <Card className="methodology-foot"><strong>What is crawled</strong><p>Brand24 aggregates monitored online mentions and produces a popularity index for the selected geography. Mention counts are shown only for projects configured to return them; index-only brands remain labelled as such.</p><span>Latest index total: {data.brands.length?formatCompact(data.brands.reduce((s,b)=>s+(b.popularity??0),0)):'Unavailable'}</span></Card>
  </>;
}
