import { AlertTriangle, CircleGauge, Clock3, DatabaseZap, Layers3 } from 'lucide-react';
import type { PaidBlock, SocialBlock } from '../types';
import { titleCase } from '../lib/format';
import { TrendChart } from '../components/Charts';
import { Card, EmptyState, KpiCard, MetricTable, Notice, SectionHeading, StatusPill } from '../components/Ui';

export const emptyPaid = (accountId = '—'): PaidBlock => ({ source:'WAC reporting warehouse', accountId, available:false, freshness:null, qaFlags:[], kpis:['impressions','reach','clicks','ctr','conversions'].map(metric => ({metric,value:null,comparison:null,delta:null})), series:[], campaigns:[], ads:[] });
export const emptySocial: SocialBlock = { connected:false, profile:null, posts:[], connection:{ title:'Connection required', message:'Jaecoo organic social is not registered with a readable WAC grant.', steps:[
  'Assign the Jaecoo Facebook Page and @jaecoo.id Instagram to the Meta business owning the Prime System User; grant read_insights, pages_read_engagement, instagram_basic and instagram_manage_insights.',
  'Register the Jaecoo brand assets and IG, FB and TikTok channels in WAC with verified token slots, then add permanent read grants. Confirm social_channel_list returns can_read:true.',
  'Re-authorise TikTok organic with @jaecoo.id and user.info.stats, video.list and video.insights.',
]}, organic:{available:false,source:'Organic connector',freshness:null,totals:{},comparisonTotals:null,deltas:{},series:[],topPosts:[]} };

function kpi(block: PaidBlock, metric: string) { return block.kpis.find((item) => item.metric === metric); }

export function OrganicMetrics({ data, platform }: { data: SocialBlock; platform: string }) {
  const totals = data.organic.totals;
  const reach=totals.reach??totals.page_impressions_unique;
  const profileViews=totals.profile_views??totals.page_views_total;
  const seriesMap=new Map<string,Record<string,unknown>>();
  for(const row of data.organic.series){const date=String(row.date??'');const item=seriesMap.get(date)??{date};const metric=String(row.metric??'');const canonical=metric==='follower_count'||metric==='page_follows'?'followers_growth':metric==='page_impressions_unique'?'reach':metric;item[canonical]=row.value;seriesMap.set(date,item)}
  const organicSeries=[...seriesMap.values()].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const followerGrowth=totals.followers_growth;
  return <section className="content-section"><SectionHeading kicker="02 · Owned channel" title="Organic performance" description={`Range-aware ${platform} profile and post performance. Kept separate from boosted and paid delivery.`} action={<div className="source-badges"><StatusPill status={data.organic.available ? 'live' : 'unavailable'} label={data.organic.available ? 'connected' : 'connection required'}/>{data.organic.freshness && <StatusPill status={data.organic.freshness.states.includes('partial') ? 'partial' : 'live'} label={data.organic.freshness.latestReportDate}/>}</div>}/>
    <div className="kpi-grid four"><KpiCard label="Follower growth" metric="followers" value={followerGrowth} delta={data.organic.deltas.followers_growth}/><KpiCard label="Organic reach" metric="reach" value={reach} delta={data.organic.deltas.reach} accent="teal"/><KpiCard label="Profile views" metric="profile_views" value={profileViews} delta={data.organic.deltas.profile_views} accent="orange"/><KpiCard label="Engagement rate" metric="engagement_rate" value={totals.engagement_rate} delta={data.organic.deltas.engagement_rate} accent="rose"/></div>
    <div className="split-grid wide-left"><Card><div className="card-head"><div><strong>Follower growth & reach</strong><span>Daily, owned activity only</span></div><CircleGauge size={18}/></div><TrendChart data={organicSeries} primary="followers_growth" secondary="reach"/></Card><Card><div className="card-head"><div><strong>Top organic posts</strong><span>Ranked by engagement</span></div><Layers3 size={18}/></div><MetricTable rows={data.organic.topPosts} emptyMessage="Connect the channel to load real posts. No sample engagement is substituted."/></Card></div>
  </section>;
}

export function PaidMetrics({ data, platform }: { data: PaidBlock; platform: string }) {
  return <section className="content-section"><SectionHeading kicker="03 · Performance media" title={`${platform} paid media`} description="Normalized daily facts from the WAC reporting warehouse. Account totals and campaign entities use the same selected window." action={<div className="source-badges"><StatusPill status={data.available ? 'live' : 'unavailable'} label={data.available ? 'data available' : 'awaiting backfill'}/>{data.freshness && <StatusPill status={data.freshness.states.includes('partial') ? 'partial' : 'live'} label={data.freshness.latestReportDate}/>}</div>}/>
    {!data.available && <Notice type="info" title="No trusted facts for this window"><p>The database returned no account-level facts. Run the full-history backfill or inspect source health; the dashboard will not convert an empty report into zero delivery.</p></Notice>}
    {data.qaFlags.map((flag) => <Notice key={flag} type="warning" title="Data-quality review"><p>{flag}</p></Notice>)}
    <div className="kpi-grid five">{['impressions','reach','clicks','ctr','conversions'].map((metric,index) => { const item=kpi(data,metric); return <KpiCard key={metric} label={titleCase(metric)} metric={metric} value={item?.value} delta={item?.delta} accent={['indigo','blue','teal','orange','rose'][index]}/>; })}</div>
    <div className="split-grid wide-left"><Card><div className="card-head"><div><strong>Delivery movement</strong><span>{data.freshness ? `Facts through ${data.freshness.latestReportDate}` : 'Awaiting the first successful ingestion'}</span></div><Clock3 size={18}/></div><TrendChart data={data.series} primary="impressions" secondary="clicks"/></Card><Card><div className="card-head"><div><strong>Campaign breakdown</strong><span>Ranked by impressions; funnel tags inferred from entity naming</span></div><DatabaseZap size={18}/></div><MetricTable rows={data.campaigns} emptyMessage="Campaign-level facts are unavailable for this window."/></Card></div>
    <Card><div className="card-head"><div><strong>Ad breakdown</strong><span>Ad-grain WAC facts; campaign context shown when available</span></div><DatabaseZap size={18}/></div><MetricTable rows={data.ads} emptyMessage="Ad-level facts are unavailable for this window."/></Card>
  </section>;
}

export function DataErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return <div className="api-banner"><AlertTriangle size={17}/><div><strong>API connection required</strong><span>{message} The full dashboard chrome remains visible so setup can be verified without fabricating metrics.</span></div></div>;
}
