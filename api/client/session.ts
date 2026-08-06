import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../../db/client.js';
import { clearClientSession, CLIENT_SLUG, hasClientSession, issueClientSession, readJsonBody, requestIpHash, validatePasscode, verifyPasscode } from '../_lib/client-auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return res.status(200).json({ authenticated: await hasClientSession(req) });
  if (req.method === 'DELETE') {
    clearClientSession(res);
    return res.status(200).json({ authenticated: false });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const body = await readJsonBody(req);
  if (!validatePasscode(body.passcode)) return res.status(400).json({ error: 'invalid_passcode' });
  const sql = getDb();
  const ipHash = requestIpHash(req);
  const attempts = await sql`
    select count(*)::int as failures from client_auth_attempt
    where client_slug=${CLIENT_SLUG} and ip_hash=${ipHash} and succeeded=false
      and attempted_at > now() - interval '15 minutes'
  `;
  if (Number(attempts[0]?.failures ?? 0) >= 5) {
    res.setHeader('Retry-After', '900');
    return res.status(429).json({ error: 'too_many_attempts', message: 'Too many attempts. Try again in 15 minutes.' });
  }
  const rows = await sql`select enabled, passcode_hash, session_version from client_access where client_slug=${CLIENT_SLUG} limit 1`;
  const access = rows[0];
  const valid = Boolean(access?.enabled && access?.passcode_hash && verifyPasscode(body.passcode, String(access.passcode_hash)));
  await sql`insert into client_auth_attempt(client_slug,ip_hash,succeeded) values(${CLIENT_SLUG},${ipHash},${valid})`;
  if (!valid) return res.status(401).json({ error: 'access_denied', message: 'Incorrect passcode or client access is disabled.' });
  await sql`delete from client_auth_attempt where client_slug=${CLIENT_SLUG} and ip_hash=${ipHash} and succeeded=false`;
  issueClientSession(res, Number(access.session_version));
  return res.status(200).json({ authenticated: true });
}

