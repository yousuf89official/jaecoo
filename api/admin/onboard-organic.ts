import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { McpGateway } from '../../ingestion/mcp-client.js';

const argumentsSchema = z.record(z.string(), z.unknown());
export const planSchema = z.object({
  brandAssets: z.array(argumentsSchema).min(1),
  channels: z.array(z.object({
    platform: z.enum(['instagram', 'facebook', 'tiktok']),
    handle: z.string().transform((value) => value.replace(/^@/, '').toLowerCase()).pipe(z.literal('jaecoo.id')),
    register: argumentsSchema,
    grant: argumentsSchema,
  })).length(3),
}).superRefine((plan, context) => {
  const platforms = new Set(plan.channels.map((channel) => channel.platform));
  for (const platform of ['instagram', 'facebook', 'tiktok'] as const) {
    if (!platforms.has(platform)) context.addIssue({ code: 'custom', path: ['channels'], message: `Missing ${platform} channel` });
  }
});

function bearer(req: VercelRequest) {
  const value = req.headers.authorization;
  return typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7) : '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!process.env.ADMIN_REFRESH_SECRET || bearer(req) !== process.env.ADMIN_REFRESH_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!process.env.WAC_MCP_URL || !process.env.WAC_MCP_OWNER_TOKEN) {
    return res.status(503).json({ error: 'owner_connector_not_configured' });
  }
  let rawPlan: unknown;
  try { rawPlan = JSON.parse(process.env.JAECOO_ORGANIC_ONBOARDING_JSON ?? ''); }
  catch { return res.status(503).json({ error: 'onboarding_plan_not_configured' }); }
  const parsed = planSchema.safeParse(rawPlan);
  if (!parsed.success) return res.status(503).json({ error: 'invalid_onboarding_plan', issues: parsed.error.issues.map((issue) => issue.message) });

  const gateway = new McpGateway(process.env.WAC_MCP_URL, process.env.WAC_MCP_OWNER_TOKEN);
  await gateway.connect();
  try {
    for (const args of parsed.data.brandAssets) await gateway.call('brand_asset_register', args);
    for (const channel of parsed.data.channels) {
      await gateway.call('social_channel_register', channel.register);
      await gateway.call('social_channel_grant_upsert', channel.grant);
    }
    const listing = await gateway.call('social_channel_list', {});
    const channels = (listing.channels ?? listing.data ?? []) as Array<Record<string, unknown>>;
    const readable = Array.isArray(channels) ? channels.filter((channel) => {
      const handle = String(channel.handle ?? '').replace(/^@/, '').toLowerCase();
      return handle === 'jaecoo.id' && channel.can_read === true;
    }).map((channel) => String(channel.platform ?? 'unknown')) : [];
    const required = ['instagram', 'facebook', 'tiktok'];
    const missing = required.filter((platform) => !readable.includes(platform));
    if (missing.length) return res.status(409).json({ ok: false, error: 'grant_verification_failed', missing });
    return res.status(200).json({ ok: true, readable, message: 'Jaecoo organic channels are registered and readable.' });
  } catch (error) {
    console.error('Organic onboarding failed', error instanceof Error ? error.name : 'unknown_error');
    return res.status(502).json({ ok: false, error: 'onboarding_failed', message: 'The owner connector could not complete onboarding.' });
  } finally { await gateway.close(); }
}
