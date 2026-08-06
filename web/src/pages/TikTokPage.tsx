import { useQuery } from '@tanstack/react-query';
import { apiFetch, queryString } from '../lib/api';
import type { PaidBlock, RangeState, SocialBlock } from '../types';
import { ProfileCard } from '../components/ProfileCards';
import { PageHeader, SectionHeading } from '../components/Ui';
import { DataErrorBanner, emptyPaid, emptySocial, OrganicMetrics, PaidMetrics } from './shared';

interface TikTokResponse {paid:PaidBlock;tiktok:SocialBlock}

export function TikTokPage({range}:{range:RangeState}){
  const query=useQuery({queryKey:['tiktok',range],queryFn:()=>apiFetch<TikTokResponse>(`/api/tiktok?${queryString(range)}`),retry:1});
  const data=query.data??{paid:emptyPaid('7575077837867335696'),tiktok:emptySocial};
  return <><PageHeader eyebrow="TikTok intelligence" title="Attention, community and delivery" description="Organic business-account signals remain separate from reach-led paid activity, where clicks may be zero by design."/><DataErrorBanner message={query.error?.message}/>
    <section className="content-section profile-section"><SectionHeading kicker="01 · Channel identity" title="TikTok profile" description="A profile-shaped readout that only populates from the authorised Jaecoo business account."/><ProfileCard platform="tiktok" data={data.tiktok}/></section>
    <OrganicMetrics data={data.tiktok} platform="TikTok"/>
    <PaidMetrics data={data.paid} platform="TikTok"/>
  </>;
}
