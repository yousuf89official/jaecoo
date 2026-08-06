import { useEffect, useMemo, useState } from 'react';
import { useIsFetching, useQuery } from '@tanstack/react-query';
import type { NavKey, RangeState } from './types';
import { AppChrome } from './components/Shell';
import { Overview } from './pages/Overview';
import { MetaPage } from './pages/MetaPage';
import { TikTokPage } from './pages/TikTokPage';
import { GooglePage } from './pages/GooglePage';
import { SovPage } from './pages/SovPage';
import { CompetitorsPage } from './pages/CompetitorsPage';
import { TrendsPage } from './pages/TrendsPage';
import { HealthPage } from './pages/HealthPage';
import { apiFetch } from './lib/api';

const validNav:NavKey[]=['overview','meta','tiktok','google','sov','competitors','trends','health'];
const storedRange=()=>{try{const value=JSON.parse(localStorage.getItem('jaecoo-range')??'') as RangeState;return value.range==='custom'&&(!value.start||!value.end)?{range:'30',cmp:value.cmp??'prev'} as RangeState:value}catch{return {range:'30',cmp:'prev'} as RangeState}};

export default function App(){
  const hash=location.hash.replace('#/','') as NavKey;
  const [active,setActive]=useState<NavKey>(validNav.includes(hash)?hash:'overview');
  const [range,setRange]=useState<RangeState>(storedRange);
  const fetching=useIsFetching()>0;
  const health=useQuery({queryKey:['health'],queryFn:()=>apiFetch<{facts:Array<Record<string,unknown>>;states:Array<Record<string,unknown>>}>('/api/health'),retry:1,refetchInterval:60_000});
  const latestFactDate=(health.data?.facts??[]).map((row)=>String(row.latest_report_date??'')).filter(Boolean).sort().at(-1);
  const freshness=health.error
    ? {status:'unavailable' as const,label:'database unavailable'}
    : latestFactDate
      ? {status:(health.data?.facts.some((row)=>String(row.freshness_states??'').includes('partial')||String(row.freshness_states??'').includes('provisional'))?'partial':'live') as 'partial'|'live',label:`facts ${latestFactDate}`}
      : {status:'seeded' as const,label:'awaiting backfill'};
  useEffect(()=>{localStorage.setItem('jaecoo-range',JSON.stringify(range))},[range]);
  useEffect(()=>{const onHash=()=>{const key=location.hash.replace('#/','') as NavKey;if(validNav.includes(key))setActive(key)};window.addEventListener('hashchange',onHash);return()=>window.removeEventListener('hashchange',onHash)},[]);
  const navigate=(key:NavKey)=>{setActive(key);location.hash=`/${key}`;window.scrollTo({top:0,behavior:'smooth'})};
  const page=useMemo(()=>{
    switch(active){
      case'meta':return <MetaPage range={range}/>;
      case'tiktok':return <TikTokPage range={range}/>;
      case'google':return <GooglePage range={range}/>;
      case'sov':return <SovPage range={range}/>;
      case'competitors':return <CompetitorsPage range={range}/>;
      case'trends':return <TrendsPage range={range}/>;
      case'health':return <HealthPage/>;
      default:return <Overview range={range}/>;
    }
  },[active,range]);
  return <AppChrome active={active} onNav={navigate} range={range} onRange={setRange} loading={fetching} freshness={freshness}>{page}</AppChrome>;
}
