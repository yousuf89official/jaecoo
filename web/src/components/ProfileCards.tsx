import type { CSSProperties } from 'react';
import { BadgeCheck, Heart, LockKeyhole, MessageCircle, MoreHorizontal, Play } from 'lucide-react';
import type { SocialBlock } from '../types';
import { formatCompact } from '../lib/format';
import { Card, Notice, StatusPill } from './Ui';

function profileValue(profile: Record<string, unknown> | null, key: string): string {
  const value = profile?.[key];
  return typeof value === 'number' ? formatCompact(value) : typeof value === 'string' ? value : '—';
}

function imageStyle(value: unknown): CSSProperties | undefined {
  return typeof value === 'string' && /^https?:\/\//.test(value) ? { backgroundImage: `url(${value})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined;
}

function ConnectRunbook({ connection }: { connection: NonNullable<SocialBlock['connection']> }) {
  return <Notice type="secure" title={connection.title}>
    <p>{connection.message}</p>
    <ol className="connect-steps">{connection.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
    <p className="settings-hint">A masteradmin can connect and backfill this account from Settings.</p>
  </Notice>;
}

function MediaPlaceholder({ index, tiktok = false }: { index: number; tiktok?: boolean }) {
  return <div className={`media-placeholder tone-${(index % 6) + 1}`}><div className="vehicle-line"><span/><span/><span/></div>{tiktok && <span className="play-count"><Play size={11} fill="currentColor"/> —</span>}<LockKeyhole className="media-lock" size={15}/></div>;
}

function FacebookFeedCard({ post, index }: { post?: Record<string, unknown>; index: number }) {
  return <div className="fb-feed"><div className="feed-head"><div className="mini-avatar">J</div><div><strong>JAECOO Indonesia</strong><span>{post?.posted_at ? new Date(String(post.posted_at)).toLocaleDateString('en-GB') : 'Latest post'} · <span className="globe">●</span></span></div><MoreHorizontal size={17}/></div><p>{post ? String(post.caption ?? '') : 'Connect this Page to load real posts and engagement. No example performance is shown.'}</p>{post?.thumbnail_url ? <div className="real-post fb-post-media" style={imageStyle(post.thumbnail_url)}/> : <MediaPlaceholder index={index}/>}<div className="feed-reactions"><span><Heart size={14}/> {post?.likes === null || post?.likes === undefined ? '—' : formatCompact(Number(post.likes))}</span><span>{post?.comments === null || post?.comments === undefined ? '—' : formatCompact(Number(post.comments))} comments · {post?.shares === null || post?.shares === undefined ? '—' : formatCompact(Number(post.shares))} shares</span></div></div>;
}

function InstagramCard({ data }: { data: SocialBlock }) {
  const profile = data.profile;
  return <Card className="profile-card instagram-card">
    <div className="profile-appbar"><span className="app-wordmark">Instagram</span><div><Heart size={20}/><MessageCircle size={20}/></div></div>
    <div className="ig-profile-head">
      <div className="ig-avatar-ring"><div className="avatar-core" style={imageStyle(profile?.avatar_url)}>{profile?.avatar_url ? null : 'J'}</div></div>
      <div className="ig-profile-main"><div className="profile-title-row"><strong>@{profileValue(profile, 'handle')}</strong>{Boolean(profile?.verified) && <BadgeCheck size={18} fill="#3b82f6" color="#fff"/>}<StatusPill status={data.connected ? 'live' : 'unavailable'} label={data.connected ? 'connected' : 'not connected'}/></div>
      <div className="profile-buttons"><button>{data.connected ? 'Following' : 'Follow'}</button><button>Message</button><button className="square-button"><MoreHorizontal size={16}/></button></div></div>
    </div>
    <div className="profile-stat-row"><div><strong>{profileValue(profile, 'posts_count')}</strong><span>posts</span></div><div><strong>{profileValue(profile, 'followers')}</strong><span>followers</span></div><div><strong>{profileValue(profile, 'following')}</strong><span>following</span></div></div>
    <div className="profile-bio"><strong>{profileValue(profile, 'display_name') === '—' ? 'JAECOO Indonesia' : profileValue(profile, 'display_name')}</strong><p>{profileValue(profile, 'bio') === '—' ? 'Profile details will populate only after a verified read connection.' : profileValue(profile, 'bio')}</p></div>
    <div className="ig-grid">{data.posts.length ? data.posts.slice(0, 9).map((post, index) => <div key={String(post.post_id ?? index)} className="real-post" style={{ backgroundImage: `url(${String(post.thumbnail_url ?? '')})` }}><span><Heart size={13} fill="currentColor"/> {formatCompact(Number(post.likes ?? 0))} <MessageCircle size={13} fill="currentColor"/> {formatCompact(Number(post.comments ?? 0))}</span></div>) : Array.from({length:9}, (_, i) => <MediaPlaceholder key={i} index={i}/>)}</div>
    {!data.connected && data.connection && <div className="profile-connect"><ConnectRunbook connection={data.connection}/></div>}
  </Card>;
}

function FacebookCard({ data }: { data: SocialBlock }) {
  const profile = data.profile;
  return <Card className="profile-card facebook-card">
    <div className="fb-cover" style={imageStyle(profile?.cover_url)}><span>JAECOO</span><small>FROM CLASSIC, BEYOND CLASSIC</small></div>
    <div className="fb-identity"><div className="fb-avatar" style={imageStyle(profile?.avatar_url)}>{profile?.avatar_url ? null : 'J'}</div><div><div className="profile-title-row"><strong>{profileValue(profile, 'display_name') === '—' ? 'JAECOO Indonesia' : profileValue(profile, 'display_name')}</strong>{Boolean(profile?.verified) && <BadgeCheck size={18} fill="#1877f2" color="#fff"/>}</div><p>Automotive manufacturer · <b>{profileValue(profile, 'followers')}</b> followers · <b>{profileValue(profile, 'likes_total')}</b> likes</p></div></div>
    <div className="fb-actions"><button className="fb-primary">{data.connected ? 'Following' : 'Follow'}</button><button>Message</button><button className="square-button"><MoreHorizontal size={16}/></button><StatusPill status={data.connected ? 'live' : 'unavailable'} label={data.connected ? 'connected' : 'not connected'}/></div>
    <div className="fb-panels"><div className="fb-intro"><strong>Intro</strong><p>{profileValue(profile, 'bio') === '—' ? 'Page details will populate after the Jaecoo Page is granted to the reporting connector.' : profileValue(profile, 'bio')}</p><div className="fake-line"/><div className="fake-line short"/></div><div className="fb-feed-list">{data.posts.length ? data.posts.slice(0,3).map((post,index)=><FacebookFeedCard key={String(post.post_id??index)} post={post} index={index}/>) : <FacebookFeedCard index={2}/>}</div></div>
    {!data.connected && data.connection && <div className="profile-connect"><ConnectRunbook connection={data.connection}/></div>}
  </Card>;
}

function TikTokCard({ data }: { data: SocialBlock }) {
  const profile = data.profile;
  return <Card className="profile-card tiktok-card">
    <div className="tiktok-profile-head"><div className="tiktok-avatar" style={imageStyle(profile?.avatar_url)}>{profile?.avatar_url ? null : 'J'}<span/></div><strong>{profileValue(profile, 'display_name') === '—' ? 'JAECOO Indonesia' : profileValue(profile, 'display_name')}</strong><div className="profile-title-row"><span>@{profileValue(profile, 'handle')}</span>{Boolean(profile?.verified) && <BadgeCheck size={17} fill="#20d5ec" color="#fff"/>}<StatusPill status={data.connected ? 'live' : 'unavailable'} label={data.connected ? 'connected' : 'not connected'}/></div><button className="tiktok-follow">Follow</button></div>
    <div className="profile-stat-row tiktok-stats"><div><strong>{profileValue(profile, 'following')}</strong><span>Following</span></div><div><strong>{profileValue(profile, 'followers')}</strong><span>Followers</span></div><div><strong>{profileValue(profile, 'likes_total')}</strong><span>Likes</span></div></div>
    <p className="tiktok-bio">{profileValue(profile, 'bio') === '—' ? 'Bio and profile statistics will populate after business-account authorisation.' : profileValue(profile, 'bio')}</p>
    <div className="tiktok-tabs"><span>Videos</span><span>Liked</span></div><div className="tiktok-grid">{data.posts.length ? data.posts.slice(0, 9).map((post, i) => <div key={String(post.post_id ?? i)} className="real-post vertical" style={{ backgroundImage: `url(${String(post.thumbnail_url ?? '')})` }}><span className="play-count"><Play size={11} fill="currentColor"/> {formatCompact(Number(post.views ?? 0))}</span></div>) : Array.from({length:9}, (_, i) => <MediaPlaceholder key={i} index={i} tiktok/>)}</div>
    {!data.connected && data.connection && <div className="profile-connect"><ConnectRunbook connection={data.connection}/></div>}
  </Card>;
}

export function ProfileCard({ platform, data }: { platform: 'instagram' | 'facebook' | 'tiktok'; data: SocialBlock }) {
  if (platform === 'instagram') return <InstagramCard data={data}/>;
  if (platform === 'facebook') return <FacebookCard data={data}/>;
  return <TikTokCard data={data}/>;
}
