import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

type JsonObject = Record<string, unknown>;

export class McpGateway {
  private client: Client;
  private transport: StreamableHTTPClientTransport;

  constructor(url: string, accessToken?: string) {
    this.client = new Client({ name: 'jaecoo-ingestion', version: '1.0.0' });
    this.transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
    });
  }

  async connect() { await this.client.connect(this.transport); }
  async close() { await this.client.close(); }

  async call(tool: string, args: JsonObject): Promise<JsonObject> {
    const result = await this.client.callTool({ name: tool, arguments: args });
    if (result.isError) throw new Error(`MCP ${tool} returned an error: ${JSON.stringify(result.content)}`);
    if (result.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent as JsonObject;
    const content = Array.isArray(result.content) ? result.content as Array<{ type: string; text?: string }> : [];
    const text = content.find((item) => item.type === 'text');
    if (!text || text.type !== 'text') return {};
    try { return JSON.parse(text.text ?? '{}') as JsonObject; }
    catch { return { text: text.text ?? '' }; }
  }
}

export function envGateway(prefix: string): McpGateway | null {
  const url = process.env[`${prefix}_MCP_URL`];
  if (!url) return null;
  return new McpGateway(url, process.env[`${prefix}_MCP_ACCESS_TOKEN`]);
}
