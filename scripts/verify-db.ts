import 'dotenv/config';
import { resolveDateRange } from '../api/_lib/date-range.ts';
import { getHealth, getPaidBlock, getSovBlock } from '../api/_lib/repository.ts';
import { closeDb } from '../db/client.ts';

try {
  const range = resolveDateRange({ range: '30', cmp: 'prev', now: new Date('2026-08-03T04:00:00Z') });
  const [health, sov, meta] = await Promise.all([getHealth(), getSovBlock(range), getPaidBlock('meta', range)]);
  if (health.states.length < 8) throw new Error(`Expected at least 8 source states; received ${health.states.length}`);
  if (sov.brands.length !== 6 || sov.latestSnapshot !== '2026-07-27') throw new Error('Verified Brand24 seed is incomplete');
  if (meta.available || meta.kpis.some((kpi) => kpi.value !== null)) throw new Error('Empty paid history must remain unavailable, not zero');
  if (meta.campaigns.length || meta.ads.length) throw new Error('Empty paid history must not fabricate campaign or ad rows');
  const { getDb } = await import('../db/client.ts');
  const sql = getDb();
  const idempotentRows = await sql.begin(async (tx) => {
    for (const value of [1, 2]) await tx`
      insert into fact_daily(platform,account_id,entity_type,entity_id,report_date,metric,raw_value,value_used,currency,timezone,freshness)
      values('verification','__verification__','account','__verification__','2026-08-03','clicks',${value},${value},'IDR','Asia/Jakarta','complete')
      on conflict(platform,account_id,entity_type,entity_id,report_date,metric,conversion_definition,attribution_window)
      do update set raw_value=excluded.raw_value,value_used=excluded.value_used
    `;
    const count = await tx`select count(*)::int as count, max(value_used)::int as value from fact_daily where platform='verification' and account_id='__verification__'`;
    await tx`delete from fact_daily where platform='verification' and account_id='__verification__'`;
    return count;
  });
  if (Number(idempotentRows[0].count) !== 1 || Number(idempotentRows[0].value) !== 2) throw new Error('Fact upsert is not idempotent');
  console.log(JSON.stringify({
    sourceStates: health.states.length,
    sovBrands: sov.brands.length,
    sovSnapshot: sov.latestSnapshot,
    emptyPaidPolicy: 'unavailable',
    idempotentFactUpsert: true,
    range,
  }, null, 2));
} finally {
  await closeDb();
}
