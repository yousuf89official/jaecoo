import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../../db/client.js';

export const CLIENT_SLUG = 'jaecoo';
export const CLIENT_COOKIE = 'jaecoo_client_session';
const SESSION_SECONDS = 12 * 60 * 60;

function requiredSecret(name: 'CLIENT_PASSCODE_PEPPER' | 'CLIENT_SESSION_SECRET') {
  const value = process.env[name];
  if (!value || value.length < 32) throw new Error(`${name} is not configured securely`);
  return value;
}

function equalText(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function validatePasscode(passcode: unknown): passcode is string {
  return typeof passcode === 'string' && /^\d{4}$/.test(passcode);
}

export function hashPasscode(passcode: string) {
  const salt = randomBytes(16).toString('hex');
  const digest = createHmac('sha256', requiredSecret('CLIENT_PASSCODE_PEPPER')).update(`${salt}:${passcode}`).digest('hex');
  return `v1$${salt}$${digest}`;
}

export function verifyPasscode(passcode: string, stored: string) {
  const [version, salt, digest] = stored.split('$');
  if (version !== 'v1' || !salt || !digest) return false;
  const actual = createHmac('sha256', requiredSecret('CLIENT_PASSCODE_PEPPER')).update(`${salt}:${passcode}`).digest('hex');
  return equalText(actual, digest);
}

function sign(payload: string) {
  return createHmac('sha256', requiredSecret('CLIENT_SESSION_SECRET')).update(payload).digest('base64url');
}

export function issueClientSession(res: VercelResponse, version: number) {
  const payload = Buffer.from(JSON.stringify({ slug: CLIENT_SLUG, version, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })).toString('base64url');
  const token = `${payload}.${sign(payload)}`;
  res.setHeader('Set-Cookie', `${CLIENT_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`);
}

export function clearClientSession(res: VercelResponse) {
  res.setHeader('Set-Cookie', `${CLIENT_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

function cookie(req: VercelRequest, name: string) {
  const header = typeof req.headers.cookie === 'string' ? req.headers.cookie : '';
  return header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? '';
}

export async function hasClientSession(req: VercelRequest) {
  const token = cookie(req, CLIENT_COOKIE);
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !equalText(sign(payload), signature)) return false;
  let parsed: { slug?: string; version?: number; exp?: number };
  try { parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as typeof parsed; }
  catch { return false; }
  if (parsed.slug !== CLIENT_SLUG || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return false;
  const sql = getDb();
  const rows = await sql`select enabled, session_version from client_access where client_slug=${CLIENT_SLUG} limit 1`;
  return Boolean(rows[0]?.enabled) && Number(rows[0]?.session_version) === parsed.version;
}

export function adminAuthorized(req: VercelRequest) {
  const authorization = req.headers.authorization;
  return Boolean(process.env.ADMIN_REFRESH_SECRET) && authorization === `Bearer ${process.env.ADMIN_REFRESH_SECRET}`;
}

export function requestIpHash(req: VercelRequest) {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]) ?? req.socket?.remoteAddress ?? 'unknown';
  return createHmac('sha256', requiredSecret('CLIENT_SESSION_SECRET')).update(raw.trim()).digest('hex');
}

export async function readJsonBody(req: VercelRequest): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') return req.body as Record<string, unknown>;
  if (typeof req.body === 'string') return JSON.parse(req.body) as Record<string, unknown>;
  return {};
}
