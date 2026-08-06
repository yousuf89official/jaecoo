import { useQuery } from '@tanstack/react-query';
import { MapPinned, Sparkles } from 'lucide-react';
import { apiFetch, queryString } from '../lib/api';
import type { RangeState } from '../types';
import { HorizontalBars } from '../components/Charts';
import { Card, Notice, PageHeader, SectionHeading, StatusPill } from '../components/Ui';
import { DataErrorBanner } from './shared';

interface CompetitorApiRow {
  brand: string;
  model: string | null;
  powertrain: string;
}

interface CompetitorsResponse {
  checkedAt: string;
  competitors: CompetitorApiRow[];
  sov: Array<{ brand: string; popularity: number | null }>;
  sovSnapshot: string | null;
}

const positioning = [
  {brand:'Chery',position:'Value-led intelligent hybrid SUV',tone:'#9d2b3e'},
  {brand:'BYD',position:'Scale EV challenger with a wide ladder',tone:'#3158b7'},
  {brand:'Wuling',position:'Accessible urban electric mobility',tone:'#1a8c79'},
  {brand:'Geely',position:'Smart urban EV with global scale',tone:'#5d4fa2'},
  {brand:'MG',position:'Heritage-led performance electrification',tone:'#c1534b'},
];

function CarSilhouette({color}:{color:string}){return <svg className="car-silhouette" viewBox="0 0 320 115" role="img" aria-label="Abstract SUV silhouette"><path d="M24 75c8-20 27-29 54-31l35-27h79c22 1 39 11 57 29l39 7c11 2 18 10 18 21v8H24z" fill={color} opacity=".12"/><path d="M35 75h246M81 44l38-24h67c20 1 34 9 50 27M106 23l8 22m84-21l17 23" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"/><circle cx="86" cy="79" r="22" fill="#fff" stroke={color} strokeWidth="4"/><circle cx="86" cy="79" r="8" fill={color}/><circle cx="246" cy="79" r="22" fill="#fff" stroke={color} strokeWidth="4"/><circle cx="246" cy="79" r="8" fill={color}/></svg>}

export function CompetitorsPage({range}:{range:RangeState}){
  const query=useQuery({queryKey:['competitors',range],queryFn:()=>apiFetch<CompetitorsResponse>(`/api/competitors?${queryString(range)}`),retry:1});
  const rows=query.data?.competitors??[];
  const byBrand=new Map(rows.map((row)=>[row.brand,row]));
  const competitors=positioning.map((item)=>({
    ...item,
    model:byBrand.get(item.brand)?.model??'Comparable current model',
    energy:byBrand.get(item.brand)?.powertrain??'Unavailable',
  }));
  const sovBars=(query.data?.sov??[]).filter((row)=>row.popularity!==null).map((row)=>({label:row.brand,value:row.popularity!})).sort((a,b)=>b.value-a.value);
  return <><PageHeader eyebrow="Competitive landscape" title="The NEV consideration set" description="A product-positioning view for Indonesia, kept separate from media-performance facts." aside={<div className="hero-badge"><MapPinned size={18}/><div><strong>Indonesia</strong><span>{query.data?.checkedAt?`Landscape checked ${query.data.checkedAt}`:'Awaiting competitor API'}</span></div></div>}/><DataErrorBanner message={query.error?.message}/>
    <Notice type="info" title="Positioning-source policy"><p>Only named competitor models and verified powertrain positioning are shown. Commercial and media cost fields are excluded.</p></Notice>
    <div className="competitor-grid">{competitors.map((item)=><Card className="competitor-card" key={item.brand}><div className="competitor-top"><span className="competitor-brand">{item.brand}</span><StatusPill status={item.energy!=='Unavailable'?'live':'unavailable'} label={item.energy}/></div><CarSilhouette color={item.tone}/><div className="competitor-model"><div><strong>{item.model}</strong><span>{item.position}</span></div></div></Card>)}</div>
    <section className="content-section"><SectionHeading kicker="Conversation signal" title="Brand24 popularity by competitor" description="Rolling 30-day index, filtered to the latest snapshot at or before the selected range end." action={<StatusPill status={sovBars.length?'seeded':'unavailable'} label={query.data?.sovSnapshot?`snapshot ${query.data.sovSnapshot}`:'awaiting snapshot'}/>}/><Card><HorizontalBars data={sovBars}/></Card></section>
    <section className="strategy-strip"><div><Sparkles size={20}/><strong>JAECOO opportunity</strong></div><p>Own the intersection of genuine SUV capability and accessible NEV technology. Use J5 EV to create reach, then translate interest into J7/J8 premium consideration through capability, technology and model-comparison content.</p></section>
  </>;
}
