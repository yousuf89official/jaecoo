import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Compass, FileSearch, SearchCheck, Target } from 'lucide-react';
import { apiFetch, queryString } from '../lib/api';
import type { PaidBlock, RangeState, WebBlock } from '../types';
import { HorizontalBars, TrendChart } from '../components/Charts';
import { Card, Notice, PageHeader, SectionHeading, StatusPill } from '../components/Ui';
import { DataErrorBanner, emptyPaid } from './shared';

interface GoogleResponse {paid:PaidBlock;gsc:WebBlock;ga4:WebBlock}
const emptyWeb:WebBlock={source:'Google Search Console',accountId:'sc-domain:jaecoo.id',available:false,freshness:null,totals:{},comparisonTotals:null,deltas:{},series:[],breakdown:[]};
const levers=[
  {icon:SearchCheck,title:'Win non-brand discovery',copy:'Build pages for electric SUV, hybrid SUV, range, charging and ownership-cost intent—not only model names.'},
  {icon:FileSearch,title:'Answer comparison intent',copy:'Create transparent J5/J7/J8 comparison content against the models users already evaluate.'},
  {icon:Target,title:'Connect demand to leads',copy:'Define test-drive, WhatsApp, brochure and dealer-locator events before optimising lower-funnel media.'},
  {icon:Compass,title:'Localise dealer demand',copy:'Pair national model demand with city and dealer landing pages, then measure assisted conversions.'},
];

export function TrendsPage({range}:{range:RangeState}){
  const query=useQuery({queryKey:['trends',range],queryFn:()=>apiFetch<GoogleResponse>(`/api/google?${queryString(range)}`),retry:1});
  const gsc=query.data?.gsc??emptyWeb;
  const queries=gsc.breakdown.filter((r)=>r.type==='query'&&r.metric==='impressions').slice(0,12).map((r)=>({label:r.label,value:r.value??0}));
  return <><PageHeader eyebrow="Demand signals" title="Search interest, measured from owned evidence" description="Google Search Console branded impressions act as the range-aware proxy. This page does not relabel that proxy as Google Trends data." aside={<div className="hero-badge"><ArrowUpRight size={18}/><div><strong>Demand proxy</strong><span>GSC branded impressions</span></div></div>}/><DataErrorBanner message={query.error?.message}/>
    <Notice type="warning" title="Method boundary"><p>Google Trends is not connected as a source. Until it is, every chart below is explicitly sourced from Search Console impressions for jaecoo.id.</p></Notice>
    <section className="content-section"><SectionHeading kicker="Branded demand" title="Interest trajectory" description="Daily for shorter ranges and monthly for longer windows." action={<StatusPill status={gsc.available?'live':'unavailable'} label={gsc.available?'GSC connected':'awaiting GSC sync'}/>}/><div className="split-grid wide-left"><Card><div className="card-head"><div><strong>Branded search impressions</strong><span>Owned search visibility proxy</span></div></div><TrendChart data={gsc.series} primary="impressions" secondary="clicks"/></Card><Card><div className="card-head"><div><strong>Demand by query</strong><span>Highest-impression branded terms</span></div></div><HorizontalBars data={queries}/></Card></div></section>
    <section className="content-section"><SectionHeading kicker="Strategy system" title="Turn interest into measurable action" description="Four levers that connect search demand to content, media and dealer outcomes."/><div className="lever-grid">{levers.map((lever,index)=><Card className="lever-card" key={lever.title}><span>0{index+1}</span><lever.icon size={22}/><strong>{lever.title}</strong><p>{lever.copy}</p></Card>)}</div></section>
  </>;
}
