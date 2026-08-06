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
import { SettingsPage } from './pages/SettingsPage';
import { ClientLogin } from './components/ClientLogin';
import { apiFetch } from './lib/api';

const validNav:NavKey[]=['overview','meta','tiktok','google','sov','competitors','trends','settings'];
const storedRange=()=>{try{const value=JSON.parse(localStorage.getItem('jaecoo-range')??'') as RangeState;return value.range==='custom'&&(!value.start||!value.end)?{range:'30',cmp:value.cmp??'prev'} as RangeState:value}catch{return {range:'30',cmp:'prev'} as RangeState}};

export default function App(){
  const clientMode=location.pathname.startsWith('/client/jaecoo');
  const session=useQuery({queryKey:['client-session'],queryFn:()=>apiFetch<{authenticated:boolean}>('/api/client/session'),enabled:clientMode,retry:false,staleTime:0});
  if(clientMode&&(session.isPending||!session.data?.authenticated))return <ClientLogin onAuthenticated={()=>session.refetch()}/>;
  return <Dashboard clientMode={clientMode}/>;
}

function Dashboard({clientMode}:{clientMode:boolean}){
  const hash=location.hash.replace('#/','') as NavKey;
  const allowedNav=clientMode?validNav.filter((key)=>key!=='settings'):validNav;
  const [active,setActive]=useState<NavKey>(allowedNav.includes(hash)?hash:'overview');
  const [range,setRange]=useState<RangeState>(storedRange);
  const fetching=useIsFetching()>0;
  const health=useQuery({queryKey:['health'],queryFn:()=>apiFetch<{facts:Array<Record<string,unknown>>;states:Array<Record<string,unknown>>}>('/api/health'),retry:1,refetchInterval:60_000,enabled:!clientMode});
  const latestFactDate=(health.data?.facts??[]).map((row)=>String(row.latest_report_date??'')).filter(Boolean).sort().at(-1);
  const freshness=health.error
    ? {status:'unavailable' as const,label:'database unavailable'}
    : latestFactDate
      ? {status:(health.data?.facts.some((row)=>String(row.freshness_states??'').includes('partial')||String(row.freshness_states??'').includes('provisional'))?'partial':'live') as 'partial'|'live',label:`facts ${latestFactDate}`}
      : {status:'seeded' as const,label:'awaiting backfill'};
  useEffect(()=>{localStorage.setItem('jaecoo-range',JSON.stringify(range))},[range]);
  useEffect(()=>{const onHash=()=>{const key=location.hash.replace('#/','') as NavKey;if(allowedNav.includes(key))setActive(key);else if(clientMode)setActive('overview')};window.addEventListener('hashchange',onHash);return()=>window.removeEventListener('hashchange',onHash)},[clientMode,allowedNav]);
  const navigate=(key:NavKey)=>{setActive(key);location.hash=`/${key}`;window.scrollTo({top:0,behavior:'smooth'})};
  const page=useMemo(()=>{
    switch(active){
      case'meta':return <MetaPage range={range}/>;
      case'tiktok':return <TikTokPage range={range}/>;
      case'google':return <GooglePage range={range}/>;
      case'sov':return <SovPage range={range}/>;
      case'competitors':return <CompetitorsPage range={range}/>;
      case'trends':return <TrendsPage range={range}/>;
      case'settings':return <SettingsPage/>;
      default:return <Overview range={range}/>;
    }
  },[active,range]);
  const logout=async()=>{await fetch('/api/client/session',{method:'DELETE',credentials:'same-origin'});location.reload()};
  return <AppChrome active={active} onNav={navigate} range={range} onRange={setRange} loading={fetching} freshness={clientMode?{status:'live',label:'secure client view'}:freshness} clientMode={clientMode} onClientLogout={logout}>{page}</AppChrome>;
}
