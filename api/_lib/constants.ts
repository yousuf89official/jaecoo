export const ACCOUNTS = {
  meta: 'act_1372413011147906',
  tiktok: '7575077837867335696',
  google: '2762824884',
  ga4: '470554174',
  gsc: 'sc-domain:jaecoo.id',
} as const;

export const ORGANIC_ONBOARDING_STEPS = [
  'Assign the Jaecoo Facebook Page and @jaecoo.id Instagram to the Meta business owning the Prime System User; grant read_insights, pages_read_engagement, instagram_basic and instagram_manage_insights.',
  'Register the Jaecoo brand assets and IG, FB and TikTok social channels in WAC with verified token slots, then add permanent read grants. Confirm social_channel_list returns can_read:true.',
  'Re-authorise TikTok organic with the @jaecoo.id business account and the user.info.stats, video.list and video.insights scopes.',
] as const;
