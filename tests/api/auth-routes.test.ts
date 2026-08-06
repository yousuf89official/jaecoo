import { afterEach, describe, expect, it } from 'vitest';
import cronHandler from '../../api/cron/ingest.ts';
import refreshHandler from '../../api/refresh.ts';
import onboardingHandler from '../../api/admin/onboard-organic.ts';

function response() {
  const result = { statusCode: 0, body: null as unknown };
  const res = {
    status(code: number) { result.statusCode = code; return res; },
    json(body: unknown) { result.body = body; return res; },
  };
  return { res, result };
}

const previousCron = process.env.CRON_SECRET;
const previousAdmin = process.env.ADMIN_REFRESH_SECRET;

afterEach(() => {
  if (previousCron === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previousCron;
  if (previousAdmin === undefined) delete process.env.ADMIN_REFRESH_SECRET; else process.env.ADMIN_REFRESH_SECRET = previousAdmin;
});

describe('protected ingestion and onboarding routes', () => {
  it('rejects a cron request without the configured secret', async () => {
    process.env.CRON_SECRET = 'expected';
    const { res, result } = response();
    await cronHandler({ method: 'GET', headers: {} } as never, res as never);
    expect(result).toEqual({ statusCode: 401, body: { error: 'unauthorized' } });
  });

  it.each([refreshHandler, onboardingHandler])('rejects an owner action without the configured secret', async (handler) => {
    process.env.ADMIN_REFRESH_SECRET = 'expected';
    const { res, result } = response();
    await handler({ method: 'POST', headers: {} } as never, res as never);
    expect(result).toEqual({ statusCode: 401, body: { error: 'unauthorized' } });
  });
});
