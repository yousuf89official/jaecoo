import 'dotenv/config';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import overview from '../api/overview.ts';
import meta from '../api/meta.ts';
import tiktok from '../api/tiktok.ts';
import google from '../api/google.ts';
import sov from '../api/sov.ts';
import competitors from '../api/competitors.ts';
import health from '../api/health.ts';
import refresh from '../api/refresh.ts';
import cron from '../api/cron/ingest.ts';
import onboardOrganic from '../api/admin/onboard-organic.ts';
import syncOrganic from '../api/admin/sync-organic.ts';
import clientAccess from '../api/admin/client-access.ts';
import clientSession from '../api/client/session.ts';
import clientData from '../api/client/data.ts';
import { closeDb } from '../db/client.ts';

type Handler = (request: VercelRequest, response: VercelResponse) => unknown;

const routes = new Map<string, Handler>([
  ['/api/overview', overview], ['/api/meta', meta], ['/api/tiktok', tiktok],
  ['/api/google', google], ['/api/sov', sov], ['/api/competitors', competitors],
  ['/api/health', health], ['/api/refresh', refresh], ['/api/cron/ingest', cron],
  ['/api/admin/onboard-organic', onboardOrganic],
  ['/api/admin/sync-organic', syncOrganic], ['/api/admin/client-access', clientAccess],
  ['/api/client/session', clientSession], ['/api/client/data', clientData],
]);

const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
};

function query(url: URL): Record<string, string | string[]> {
  const output: Record<string, string | string[]> = {};
  for (const [key, value] of url.searchParams) {
    const existing = output[key];
    output[key] = existing === undefined ? value : Array.isArray(existing) ? [...existing, value] : [existing, value];
  }
  return output;
}

function vercelResponse(response: ServerResponse): VercelResponse {
  const target = response as unknown as VercelResponse;
  target.status = (code: number) => { response.statusCode = code; return target; };
  target.json = (body: unknown) => {
    if (!response.hasHeader('Content-Type')) response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify(body));
    return target;
  };
  return target;
}

async function requestBody(request: IncomingMessage) {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return undefined;
  try { return JSON.parse(raw); } catch { return raw; }
}

async function serveStatic(pathname: string, response: ServerResponse) {
  const root = resolve('dist');
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let file = resolve(root, requested);
  if (!file.startsWith(`${root}/`)) file = resolve(root, 'index.html');
  try {
    if (!(await stat(file)).isFile()) file = resolve(root, 'index.html');
  } catch { file = resolve(root, 'index.html'); }
  const bytes = await readFile(file);
  response.statusCode = 200;
  response.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
  response.end(bytes);
}

const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const handler = routes.get(url.pathname);
    if (handler) {
      const vercelRequest = request as VercelRequest;
      vercelRequest.query = query(url);
      vercelRequest.body = await requestBody(request);
      await handler(vercelRequest, vercelResponse(response));
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      response.statusCode = 404;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ error: 'not_found' }));
      return;
    }
    await serveStatic(url.pathname, response);
  } catch (error) {
    response.statusCode = 500;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ error: 'local_runtime_error', message: error instanceof Error ? error.message : 'Unknown error' }));
  }
});

const port = Number(process.env.JAECOO_LOCAL_PORT ?? 4180);
const host = process.env.JAECOO_LOCAL_HOST ?? '127.0.0.1';
server.listen(port, host, () => console.log(`JAECOO full local runtime: http://${host}:${port}`));

async function shutdown() {
  server.close();
  await closeDb();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
