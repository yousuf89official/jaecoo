import { getDb } from '../db/client.js';
import { envGateway, type McpGateway } from './mcp-client.js';

type Row = Record<string, unknown>;

const list = (payload: Row, keys: string[]): Row[] => {
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) return value as Row[];
    if (value && typeof value === 'object') {
      const nested = value as Row;
      if (Array.isArray(nested.data)) return nested.data as Row[];
    }
  }
  return [];
};

const numeric = (value: unknown): number | null => {
  const parsed = Number(value);
  return value === null || value === undefined || value === '' || !Number.isFinite(parsed) ? null : parsed;
};

async function upsertProfile(platform: string, channel: Row, profile: Row): Promise<void> {
  const sql = getDb();
  const channelKey = String(channel.channel_key ?? channel.id ?? channel.handle);
  const handle = String(profile.username ?? profile.handle ?? channel.handle ?? '').replace(/^@/, '');
  await sql`
    insert into social_profile(
      platform, channel_key, handle, display_name, avatar_url, cover_url, bio, profile_url,
      verified, followers, following, posts_count, likes_total, snapshot_date
    ) values (
      ${platform}, ${channelKey}, ${handle},
      ${String(profile.name ?? profile.display_name ?? channel.display_name ?? 'JAECOO Indonesia')},
      ${String(profile.profile_picture_url ?? profile.avatar_url ?? profile.avatar ?? '') || null},
      ${String(profile.cover_url ?? '') || null}, ${String(profile.biography ?? profile.bio ?? '') || null},
      ${String(profile.profile_url ?? channel.profile_url ?? '') || null},
      ${Boolean(profile.is_verified ?? profile.verified)},
      ${numeric(profile.followers_count ?? profile.follower_count ?? profile.followers)},
      ${numeric(profile.follows_count ?? profile.following_count ?? profile.following)},
      ${numeric(profile.media_count ?? profile.video_count ?? profile.posts_count)},
      ${numeric(profile.likes_count ?? profile.likes_total)}, current_date
    )
    on conflict(platform, channel_key, snapshot_date) do update set
      handle=excluded.handle, display_name=excluded.display_name, avatar_url=excluded.avatar_url,
      cover_url=excluded.cover_url, bio=excluded.bio, profile_url=excluded.profile_url,
      verified=excluded.verified, followers=excluded.followers, following=excluded.following,
      posts_count=excluded.posts_count, likes_total=excluded.likes_total
  `;
}

async function upsertPosts(platform: string, channel: Row, posts: Row[]): Promise<number> {
  const sql = getDb();
  const channelKey = String(channel.channel_key ?? channel.id ?? channel.handle);
  let written = 0;
  for (const post of posts) {
    const id = String(post.id ?? post.post_id ?? post.video_id ?? '');
    if (!id) continue;
    const postedAt = post.timestamp ?? post.create_time ?? post.posted_at;
    const iso = typeof postedAt === 'number' ? new Date(postedAt * 1000).toISOString() : String(postedAt ?? new Date().toISOString());
    await sql`
      insert into social_post(
        platform, channel_key, post_id, post_url, posted_at, media_type, caption, thumbnail_url,
        likes, comments, shares, saves, views, reach, impressions, engagement
      ) values (
        ${platform}, ${channelKey}, ${id}, ${String(post.permalink ?? post.share_url ?? post.post_url ?? '') || null},
        ${iso}, ${String(post.media_type ?? post.type ?? 'post')}, ${String(post.caption ?? post.description ?? post.message ?? '') || null},
        ${String(post.thumbnail_url ?? post.cover_image_url ?? post.picture ?? '') || null},
        ${numeric(post.like_count ?? post.likes)}, ${numeric(post.comment_count ?? post.comments)},
        ${numeric(post.share_count ?? post.shares)}, ${numeric(post.save_count ?? post.saves)},
        ${numeric(post.view_count ?? post.views ?? post.play_count)}, ${numeric(post.reach)},
        ${numeric(post.impressions)}, ${numeric(post.engagement ?? post.total_interactions)}
      )
      on conflict(platform, channel_key, post_id) do update set
        post_url=excluded.post_url, posted_at=excluded.posted_at, media_type=excluded.media_type,
        caption=excluded.caption, thumbnail_url=excluded.thumbnail_url, likes=excluded.likes,
        comments=excluded.comments, shares=excluded.shares, saves=excluded.saves,
        views=excluded.views, reach=excluded.reach, impressions=excluded.impressions,
        engagement=excluded.engagement
    `;
    written += 1;
  }
  return written;
}

async function upsertOrganicSeries(platform: string, channel: Row, metric: string, payload: Row): Promise<number> {
  const sql = getDb();
  const channelKey = String(channel.channel_key ?? channel.id ?? channel.handle);
  const rows = list(payload, ['data', 'values', 'rows']);
  let written = 0;
  for (const row of rows) {
    const values = Array.isArray(row.values) ? row.values as Row[] : [row];
    for (const point of values) {
      const date = String(point.end_time ?? point.date ?? row.date ?? '').slice(0, 10);
      const value = numeric(point.value ?? point.total_value ?? row.value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || value === null) continue;
      await sql`
        insert into organic_daily(platform,channel_key,report_date,metric,value,freshness,ingested_at)
        values(${platform},${channelKey},${date},${metric},${value},'complete',now())
        on conflict(platform,channel_key,report_date,metric) do update set value=excluded.value,freshness=excluded.freshness,ingested_at=now()
      `;
      written += 1;
    }
  }
  return written;
}

async function upsertOrganicPoint(platform: string, channel: Row, date: string, metric: string, value: unknown): Promise<number> {
  const parsed = numeric(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || parsed === null) return 0;
  const sql = getDb();
  const channelKey = String(channel.channel_key ?? channel.id ?? channel.handle);
  await sql`
    insert into organic_daily(platform,channel_key,report_date,metric,value,freshness,ingested_at)
    values(${platform},${channelKey},${date},${metric},${parsed},'complete',now())
    on conflict(platform,channel_key,report_date,metric) do update set
      value=excluded.value,freshness=excluded.freshness,ingested_at=now()
  `;
  return 1;
}

async function syncInstagram(gateway: McpGateway, channel: Row, start: string, end: string) {
  const id = String(channel.account_id ?? channel.parent_account_id ?? channel.ig_user_id ?? '');
  const profile = await gateway.call('meta_get_ig_account', { ig_user_id: id });
  const media = await gateway.call('meta_list_ig_media', { ig_user_id: id, since: start, until: end, limit: 100 });
  const profileData = (profile.data as Row | undefined) ?? profile;
  await upsertProfile('instagram', channel, profileData);
  let rows = await upsertPosts('instagram', channel, list(media, ['data', 'media', 'posts']));
  rows += await upsertOrganicPoint('instagram', channel, end, 'follower_count', profileData.followers_count ?? profileData.follower_count ?? profileData.followers);
  for (const metric of ['reach', 'impressions', 'profile_views', 'follower_count']) {
    const insights = await gateway.call('meta_get_ig_insights', { ig_user_id: id, metric, period: 'day', metric_type: 'total_value', timeframe: 'this_month' });
    rows += await upsertOrganicSeries('instagram', channel, metric, insights);
  }
  return rows;
}

async function syncFacebook(gateway: McpGateway, channel: Row, start: string, end: string) {
  const pageId = String(channel.account_id ?? channel.parent_account_id ?? channel.page_id ?? '');
  const pages = await gateway.call('meta_list_pages', {});
  const page = list(pages, ['data', 'pages']).find((item) => String(item.id ?? item.page_id) === pageId) ?? channel;
  const posts = await gateway.call('meta_list_page_posts', { page_id: pageId, since: start, until: end, limit: 100 });
  await upsertProfile('facebook', channel, page);
  let rows = await upsertPosts('facebook', channel, list(posts, ['data', 'posts']));
  rows += await upsertOrganicPoint('facebook', channel, end, 'page_follows', page.followers_count ?? page.fan_count ?? page.followers);
  for (const metric of ['page_impressions_unique', 'page_impressions', 'page_views_total', 'page_follows']) {
    const insights = await gateway.call('meta_get_page_insights', { page_id: pageId, metric, period: 'day', since: start, until: end });
    rows += await upsertOrganicSeries('facebook', channel, metric, insights);
  }
  return rows;
}

async function syncTikTok(gateway: McpGateway, channel: Row, end: string) {
  const assetSlot = String(channel.token_slot ?? channel.asset_slot ?? '');
  const profile = await gateway.call('tiktok_get_account_profile', { asset_slot: assetSlot });
  const videos = await gateway.call('tiktok_list_videos', { asset_slot: assetSlot, cursor: 0, max_count: 100 });
  const profileData = (profile.data as Row | undefined) ?? profile;
  const videoRows = list(videos, ['data', 'videos', 'list']);
  await upsertProfile('tiktok', channel, profileData);
  let written = await upsertPosts('tiktok', channel, videoRows);
  written += await upsertOrganicPoint('tiktok', channel, end, 'follower_count', profileData.followers_count ?? profileData.follower_count ?? profileData.followers);
  written += await upsertOrganicPoint('tiktok', channel, end, 'likes_total', profileData.likes_count ?? profileData.likes_total);
  const daily = new Map<string, { views: number; engagement: number }>();
  for (const video of videoRows) {
    const created = video.create_time ?? video.posted_at ?? video.timestamp;
    const postDate = typeof created === 'number' ? new Date(created * 1000).toISOString().slice(0, 10) : String(created ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(postDate)) continue;
    const item = daily.get(postDate) ?? { views: 0, engagement: 0 };
    item.views += numeric(video.view_count ?? video.views ?? video.play_count) ?? 0;
    item.engagement += (numeric(video.like_count ?? video.likes) ?? 0)
      + (numeric(video.comment_count ?? video.comments) ?? 0)
      + (numeric(video.share_count ?? video.shares) ?? 0);
    daily.set(postDate, item);
  }
  for (const [date, values] of daily) {
    written += await upsertOrganicPoint('tiktok', channel, date, 'views', values.views);
    written += await upsertOrganicPoint('tiktok', channel, date, 'engagement', values.engagement);
  }
  return written;
}

export async function syncOrganicChannels(channels: Row[], start: string, end: string): Promise<Record<string, number>> {
  const jaecoo = channels.filter((channel) => String(channel.handle ?? '').replace(/^@/, '').toLowerCase() === 'jaecoo.id' && channel.can_read === true);
  const results: Record<string, number> = {};
  const metaGateway = envGateway('META');
  const tiktokGateway = envGateway('TIKTOK');
  if (metaGateway) {
    await metaGateway.connect();
    try {
      for (const channel of jaecoo) {
        const platform = String(channel.platform ?? '').toLowerCase();
        if (platform === 'instagram') results.instagram = await syncInstagram(metaGateway, channel, start, end);
        if (platform === 'facebook') results.facebook = await syncFacebook(metaGateway, channel, start, end);
      }
    } finally { await metaGateway.close(); }
  }
  if (tiktokGateway) {
    const channel = jaecoo.find((item) => String(item.platform ?? '').toLowerCase() === 'tiktok');
    if (channel) {
      await tiktokGateway.connect();
      try { results.tiktok = await syncTikTok(tiktokGateway, channel, end); }
      finally { await tiktokGateway.close(); }
    }
  }
  return results;
}
