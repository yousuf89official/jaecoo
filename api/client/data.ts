import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hasClientSession } from '../_lib/client-auth.js';
import { healthHandler, overviewHandler, platformHandler, sovHandler } from '../_lib/handlers.js';
import competitors from '../competitors.js';

const handlers: Record<string, (req: VercelRequest, res: VercelResponse) => unknown> = {
  overview: overviewHandler,
  meta: platformHandler('meta'),
  tiktok: platformHandler('tiktok'),
  google: platformHandler('google'),
  sov: sovHandler,
  competitors,
  health: healthHandler,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!(await hasClientSession(req))) return res.status(401).json({ error: 'client_auth_required' });
  const view = Array.isArray(req.query.view) ? req.query.view[0] : req.query.view;
  if (!view || !handlers[view]) return res.status(404).json({ error: 'view_not_found' });
  if (view === 'health') return res.status(403).json({ error: 'internal_view' });
  return handlers[view](req, res);
}
