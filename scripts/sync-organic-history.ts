import { closeDb } from '../db/client.js';
import { McpGateway } from '../ingestion/mcp-client.js';
import { syncOrganicChannels } from '../ingestion/organic.js';
import { refreshOrganicConnectionState } from '../ingestion/wac-paid.js';

const url = process.env.WAC_MCP_URL;
const token = process.env.WAC_MCP_OWNER_TOKEN;
if (!url || !token) throw new Error('WAC owner connector is not configured');
if (!process.env.META_MCP_URL || !process.env.TIKTOK_MCP_URL) throw new Error('Meta and TikTok MCP endpoints are not configured');

const start = process.env.JAECOO_ORGANIC_HISTORY_START ?? '2020-01-01';
const end = new Date().toISOString().slice(0, 10);
const gateway = new McpGateway(url, token);
await gateway.connect();
try {
  const channels = await refreshOrganicConnectionState(gateway);
  const readable = channels.filter((channel) => String(channel.handle ?? '').replace(/^@/, '').toLowerCase() === 'jaecoo.id' && channel.can_read === true);
  const missing = ['instagram', 'facebook', 'tiktok'].filter((platform) => !readable.some((channel) => String(channel.platform).toLowerCase() === platform));
  if (missing.length) throw new Error(`Jaecoo organic grants are not readable for: ${missing.join(', ')}`);
  const rowsWritten = await syncOrganicChannels(readable, start, end);
  console.log(JSON.stringify({ start, end, rowsWritten }, null, 2));
} finally {
  await gateway.close();
  await closeDb();
}
