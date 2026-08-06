import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fail, json, readRange } from './http.js';
import { getHealth, getPaidBlock, getSocialBlock, getSovBlock, getWebBlock } from './repository.js';

export async function overviewHandler(req: VercelRequest, res: VercelResponse) {
  try {
    const range = readRange(req);
    const [meta, tiktok, google, gsc, ga4] = await Promise.all([
      getPaidBlock('meta', range), getPaidBlock('tiktok', range), getPaidBlock('google', range),
      getWebBlock('gsc', range), getWebBlock('ga4', range),
    ]);
    return json(res, 200, { range, meta: { generatedAt: new Date().toISOString(), dataPolicy: 'Missing data is unavailable, never zero.' }, paid: { meta, tiktok, google }, web: { gsc, ga4 } });
  } catch (error) { return fail(res, error); }
}

export function platformHandler(platform: 'meta' | 'tiktok' | 'google') {
  return async (req: VercelRequest, res: VercelResponse) => {
    try {
      const range = readRange(req);
      if (platform === 'google') {
        const [paid, gsc, ga4] = await Promise.all([getPaidBlock('google', range), getWebBlock('gsc', range), getWebBlock('ga4', range)]);
        return json(res, 200, { range, paid, gsc, ga4 });
      }
      if (platform === 'meta') {
        const [paid, instagram, facebook] = await Promise.all([
          getPaidBlock('meta', range), getSocialBlock('instagram', range), getSocialBlock('facebook', range),
        ]);
        return json(res, 200, { range, paid, instagram, facebook });
      }
      const [paid, tiktok] = await Promise.all([
        getPaidBlock('tiktok', range), getSocialBlock('tiktok', range),
      ]);
      return json(res, 200, { range, paid, tiktok });
    } catch (error) { return fail(res, error); }
  };
}

export async function sovHandler(_req: VercelRequest, res: VercelResponse) {
  try { return json(res, 200, await getSovBlock(readRange(_req))); } catch (error) { return fail(res, error); }
}

export async function healthHandler(_req: VercelRequest, res: VercelResponse) {
  try { return json(res, 200, await getHealth()); } catch (error) { return fail(res, error); }
}
