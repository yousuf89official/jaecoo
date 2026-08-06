import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Facebook, Instagram } from 'lucide-react';
import { apiFetch, queryString } from '../lib/api';
import type { PaidBlock, RangeState, SocialBlock } from '../types';
import { ProfileCard } from '../components/ProfileCards';
import { PageHeader, SectionHeading } from '../components/Ui';
import { DataErrorBanner, emptyPaid, emptySocial, OrganicMetrics, PaidMetrics } from './shared';

interface MetaResponse { paid:PaidBlock;instagram:SocialBlock;facebook:SocialBlock }

export function MetaPage({ range }: { range: RangeState }) {
  const [channel,setChannel]=useState<'instagram'|'facebook'>('instagram');
  const query=useQuery({queryKey:['meta',range],queryFn:()=>apiFetch<MetaResponse>(`/api/meta?${queryString(range)}`),retry:1});
  const data=query.data??{paid:emptyPaid('act_1372413011147906'),instagram:emptySocial,facebook:emptySocial};
  const social=data[channel];
  return <><PageHeader eyebrow="Meta ecosystem" title="Paid intelligence meets owned presence" description="Switch between Instagram and Facebook. The page always preserves the mandated order: profile, organic performance, then paid media." aside={<div className="channel-switch"><button className={channel==='instagram'?'active':''} onClick={()=>setChannel('instagram')}><Instagram size={16}/> Instagram</button><button className={channel==='facebook'?'active':''} onClick={()=>setChannel('facebook')}><Facebook size={16}/> Facebook</button></div>}/><DataErrorBanner message={query.error?.message}/>
    <section className="content-section profile-section"><SectionHeading kicker="01 · Channel identity" title={`${channel==='instagram'?'Instagram':'Facebook'} profile`} description="Real profile chrome backed only by registered profile snapshots and posts."/><ProfileCard platform={channel} data={social}/></section>
    <OrganicMetrics data={social} platform={channel==='instagram'?'Instagram':'Facebook'}/>
    <PaidMetrics data={data.paid} platform="Meta"/>
  </>;
}
