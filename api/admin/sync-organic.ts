import type { VercelRequest, VercelResponse } from '@vercel/node';
import { McpGateway } from '../../ingestion/mcp-client.js';
import { syncOrganicChannels } from '../../ingestion/organic.js';
import { refreshOrganicConnectionState } from '../../ingestion/wac-paid.js';
import { adminAuthorized } from '../_lib/client-auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!adminAuthorized(req)) return res.status(401).json({ error: 'unauthorized' });
  if (!process.env.WAC_MCP_URL || !process.env.WAC_MCP_OWNER_TOKEN) {
    return res.status(503).json({ error: 'owner_connector_not_configured', message: 'WAC owner credentials are not configured.' });
  }
  if (!process.env.META_MCP_URL || !process.env.TIKTOK_MCP_URL) {
    return res.status(503).json({ error: 'organic_connectors_not_configured', message: 'Meta and TikTok MCP endpoints are not configured.' });
  }
  const start = process.env.JAECOO_ORGANIC_HISTORY_START ?? '2020-01-01';
  const end = new Date().toISOString().slice(0, 10);
  const gateway = new McpGateway(process.env.WAC_MCP_URL, process.env.WAC_MCP_OWNER_TOKEN);
  await gateway.connect();
  try {
    const channels = await refreshOrganicConnectionState(gateway);
    const readable = channels.filter((channel) => String(channel.handle ?? '').replace(/^@/, '').toLowerCase() === 'jaecoo.id' && channel.can_read === true);
    const missing = ['instagram', 'facebook', 'tiktok'].filter((platform) => !readable.some((channel) => String(channel.platform).toLowerCase() === platform));
    if (missing.length) return res.status(409).json({ error: 'channels_not_readable', missing, message: 'Authenticate and grant every Jaecoo channel before importing history.' });
    const rowsWritten = await syncOrganicChannels(readable, start, end);
    return res.status(200).json({ ok: true, start, end, rowsWritten, coverage: 'All history available through the connected platform APIs; current profile fields are stored as dated snapshots.' });
  } catch (error) {
    console.error('Organic historical sync failed', error instanceof Error ? error.name : 'unknown_error');
    return res.status(502).json({ error: 'organic_sync_failed', message: error instanceof Error ? error.message : 'Historical organic sync failed.' });
  } finally { await gateway.close(); }
}
