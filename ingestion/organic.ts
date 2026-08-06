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
      for (const nestedKey of keys) if (Array.isArray(nested[nestedKey])) return nested[nestedKey] as Row[];
    }
  }
  return [];
};

const numeric = (value: unknown): number | null => {
  if (value && typeof value === 'object') {
    const row = value as Row;
    value = row.total_count ?? row.value ?? (row.summary as Row | undefined)?.total_count;
  }
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
        ${String(post.thumbnail_url ?? post.cover_image_url ?? post.media_url ?? post.picture ?? '') || null},
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

function afterCursor(payload: Row): string | null {
  const paging = payload.paging as Row | undefined;
  const data = payload.data as Row | undefined;
  const nestedPaging = data?.paging as Row | undefined;
  const cursors = (paging?.cursors ?? nestedPaging?.cursors) as Row | undefined;
  return typeof cursors?.after === 'string' && cursors.after ? cursors.after : null;
}

async function metaPages(gateway: McpGateway, tool: 'meta_list_ig_media' | 'meta_list_page_posts', base: Row) {
  const rows: Row[] = [];
  let after: string | null = null;
  for (let page = 0; page < 500; page += 1) {
    const payload = await gateway.call(tool, { ...base, limit: 100, after: after ?? '' });
    rows.push(...list(payload, ['data', 'media', 'posts']));
    const next = afterCursor(payload);
    if (!next || next === after) break;
    after = next;
  }
  return rows;
}

function dateChunks(start: string, end: string, days = 90) {
  const chunks: Array<{ start: string; end: string }> = [];
  let cursor = new Date(`${start}T00:00:00Z`);
  const final = new Date(`${end}T00:00:00Z`);
  while (cursor <= final) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + days - 1);
    if (chunkEnd > final) chunkEnd.setTime(final.getTime());
    chunks.push({ start: cursor.toISOString().slice(0, 10), end: chunkEnd.toISOString().slice(0, 10) });
    cursor = new Date(chunkEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return chunks;
}

function insightValue(payload: Row, metric: string): number | null {
  const row = list(payload, ['data', 'rows']).find((item) => String(item.name ?? item.metric) === metric) ?? list(payload, ['data', 'rows'])[0];
  if (!row) return null;
  const values = Array.isArray(row.values) ? row.values as Row[] : [];
  return numeric((row.total_value as Row | undefined)?.value ?? values[0]?.value ?? row.value);
}

async function enrichInstagramMedia(gateway: McpGateway, posts: Row[]) {
  const output: Row[] = [];
  for (const post of posts) {
    const mediaId = String(post.id ?? post.post_id ?? '');
    if (!mediaId) { output.push(post); continue; }
    try {
      const insights = await gateway.call('meta_get_ig_media_insights', { media_id: mediaId, metric: 'reach,likes,comments,saved,shares,views' });
      output.push({
        ...post,
        reach: insightValue(insights, 'reach'), likes: insightValue(insights, 'likes') ?? post.like_count,
        comments: insightValue(insights, 'comments') ?? post.comments_count,
        saves: insightValue(insights, 'saved'), shares: insightValue(insights, 'shares'),
        views: insightValue(insights, 'views'),
      });
    } catch { output.push(post); }
  }
  return output;
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
  const media = await metaPages(gateway, 'meta_list_ig_media', { ig_user_id: id, since: start, until: end });
  const profileData = (profile.data as Row | undefined) ?? profile;
  await upsertProfile('instagram', channel, profileData);
  let rows = await upsertPosts('instagram', channel, await enrichInstagramMedia(gateway, media));
  rows += await upsertOrganicPoint('instagram', channel, end, 'follower_count', profileData.followers_count ?? profileData.follower_count ?? profileData.followers);
  for (const chunk of dateChunks(start, end)) {
    for (const metric of ['reach', 'profile_views', 'follower_count']) {
      const insights = await gateway.call('meta_get_ig_insights', { ig_user_id: id, metric, period: 'day', metric_type: 'time_series', since: chunk.start, until: chunk.end });
      rows += await upsertOrganicSeries('instagram', channel, metric, insights);
    }
  }
  return rows;
}

async function syncFacebook(gateway: McpGateway, channel: Row, start: string, end: string) {
  const pageId = String(channel.account_id ?? channel.parent_account_id ?? channel.page_id ?? '');
  const pages = await gateway.call('meta_list_pages', {});
  const page = list(pages, ['data', 'pages']).find((item) => String(item.id ?? item.page_id) === pageId) ?? channel;
  const posts = await metaPages(gateway, 'meta_list_page_posts', { page_id: pageId, since: start, until: end });
  await upsertProfile('facebook', channel, page);
  let rows = await upsertPosts('facebook', channel, posts);
  rows += await upsertOrganicPoint('facebook', channel, end, 'page_follows', page.followers_count ?? page.fan_count ?? page.followers);
  for (const chunk of dateChunks(start, end)) {
    for (const metric of ['page_impressions_unique', 'page_impressions', 'page_views_total', 'page_follows']) {
      const insights = await gateway.call('meta_get_page_insights', { page_id: pageId, metric, period: 'day', since: chunk.start, until: chunk.end });
      rows += await upsertOrganicSeries('facebook', channel, metric, insights);
    }
  }
  return rows;
}

async function syncTikTok(gateway: McpGateway, channel: Row, start: string, end: string) {
  const assetSlot = String(channel.token_slot ?? channel.asset_slot ?? '');
  const profile = await gateway.call('tiktok_get_account_profile', { asset_slot: assetSlot });
  const profileData = (profile.data as Row | undefined) ?? profile;
  const videoRows: Row[] = [];
  let cursor = 0;
  for (let page = 0; page < 500; page += 1) {
    const payload = await gateway.call('tiktok_list_videos', { asset_slot: assetSlot, cursor, max_count: 20 });
    const batch = list(payload, ['data', 'videos', 'list']);
    videoRows.push(...batch);
    const data = (payload.data as Row | undefined) ?? payload;
    const hasMore = Boolean(data.has_more ?? data.hasMore);
    const next = numeric(data.cursor ?? data.next_cursor);
    if (!hasMore || next === null || next === cursor) break;
    cursor = next;
  }
  const rangedVideos = videoRows.filter((video) => {
    const created = video.create_time ?? video.posted_at ?? video.timestamp;
    const date = typeof created === 'number' ? new Date(created * 1000).toISOString().slice(0, 10) : String(created ?? '').slice(0, 10);
    return date >= start && date <= end;
  });
  await upsertProfile('tiktok', channel, profileData);
  let written = await upsertPosts('tiktok', channel, rangedVideos);
  written += await upsertOrganicPoint('tiktok', channel, end, 'follower_count', profileData.followers_count ?? profileData.follower_count ?? profileData.followers);
  written += await upsertOrganicPoint('tiktok', channel, end, 'likes_total', profileData.likes_count ?? profileData.likes_total);
  const daily = new Map<string, { views: number; engagement: number }>();
  for (const video of rangedVideos) {
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

export async function syncOrganicChannels(channels: Row[], start: string, end: string, sharedGateway?: McpGateway): Promise<Record<string, number>> {
  const jaecoo = channels.filter((channel) => String(channel.handle ?? '').replace(/^@/, '').toLowerCase() === 'jaecoo.id' && channel.can_read === true);
  const results: Record<string, number> = {};
  const metaGateway = sharedGateway ?? envGateway('META');
  const tiktokGateway = sharedGateway ?? envGateway('TIKTOK');
  if (metaGateway) {
    if (!sharedGateway) await metaGateway.connect();
    try {
      for (const channel of jaecoo) {
        const platform = String(channel.platform ?? '').toLowerCase();
        if (platform === 'instagram') results.instagram = await syncInstagram(metaGateway, channel, start, end);
        if (platform === 'facebook') results.facebook = await syncFacebook(metaGateway, channel, start, end);
      }
    } finally { if (!sharedGateway) await metaGateway.close(); }
  }
  if (tiktokGateway) {
    const channel = jaecoo.find((item) => String(item.platform ?? '').toLowerCase() === 'tiktok');
    if (channel) {
      if (!sharedGateway) await tiktokGateway.connect();
      try { results.tiktok = await syncTikTok(tiktokGateway, channel, start, end); }
      finally { if (!sharedGateway) await tiktokGateway.close(); }
    }
  }
  return results;
}
