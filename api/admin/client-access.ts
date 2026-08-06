import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../../db/client.js';
import { adminAuthorized, CLIENT_SLUG, hashPasscode, readJsonBody, validatePasscode } from '../_lib/client-auth.js';

function clientUrl(req: VercelRequest) {
  const protocol = String(req.headers['x-forwarded-proto'] ?? (process.env.VERCEL ? 'https' : 'http')).split(',')[0];
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '127.0.0.1:4180').split(',')[0];
  return `${protocol}://${host}/client/${CLIENT_SLUG}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!['GET', 'POST'].includes(req.method ?? '')) return res.status(405).json({ error: 'method_not_allowed' });
  if (!adminAuthorized(req)) return res.status(401).json({ error: 'unauthorized' });
  const sql = getDb();
  if (req.method === 'POST') {
    const body = await readJsonBody(req);
    const enabled = body.enabled;
    const passcode = body.passcode;
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'invalid_enabled' });
    if (passcode !== undefined && !validatePasscode(passcode)) return res.status(400).json({ error: 'invalid_passcode', message: 'Passcode must contain exactly four digits.' });
    const existing = await sql`select passcode_hash from client_access where client_slug=${CLIENT_SLUG} limit 1`;
    if (enabled && !passcode && !existing[0]?.passcode_hash) return res.status(400).json({ error: 'passcode_required' });
    const passcodeHash = passcode ? hashPasscode(passcode) : existing[0]?.passcode_hash ?? null;
    await sql`
      insert into client_access(client_slug,enabled,passcode_hash,session_version,updated_at)
      values(${CLIENT_SLUG},${enabled},${passcodeHash},1,now())
      on conflict(client_slug) do update set
        enabled=excluded.enabled,
        passcode_hash=excluded.passcode_hash,
        session_version=client_access.session_version + 1,
        updated_at=now()
    `;
  }
  const rows = await sql`select enabled, passcode_hash is not null as passcode_set, updated_at from client_access where client_slug=${CLIENT_SLUG} limit 1`;
  const row = rows[0];
  return res.status(200).json({
    slug: CLIENT_SLUG,
    enabled: Boolean(row?.enabled),
    passcodeSet: Boolean(row?.passcode_set),
    updatedAt: row?.updated_at ?? null,
    clientUrl: clientUrl(req),
  });
}

