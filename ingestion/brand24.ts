import { getDb } from '../db/client.js';
import { envGateway } from './mcp-client.js';

type Row = Record<string, unknown>;
const BRANDS = ['Jaecoo', 'Chery', 'BYD', 'Wuling', 'Geely', 'MG'];
const TRACKED_PROJECTS = ['Jaecoo', 'Geely', 'MG', 'Honda'];

function records(payload: Row): Row[] {
  for (const key of ['brands', 'data', 'results', 'comparison']) {
    const value = payload[key];
    if (Array.isArray(value)) return value as Row[];
    if (value && typeof value === 'object') return Object.entries(value as Row).map(([brand, item]) => ({ brand, ...(typeof item === 'object' && item ? item as Row : { popularity: item }) }));
  }
  return [];
}

export async function syncBrand24(snapshotDate: string): Promise<number> {
  const gateway = envGateway('BRAND24');
  if (!gateway) return 0;
  await gateway.connect();
  try {
    const payload = await gateway.call('brand24_quick_popularity_comparison', { brandNames: BRANDS, countryCode: 'ID', response_format: 'json' });
    const sql = getDb();
    let written = 0;
    for (const item of records(payload)) {
      const brand = String(item.brand ?? item.name ?? item.brandName ?? '');
      if (!BRANDS.includes(brand)) continue;
      const popularity = Number(item.popularity ?? item.popularity_index ?? item.index);
      const mentions = Number(item.mentions ?? item.mentions_count);
      if (!Number.isFinite(popularity)) continue;
      await sql`
        insert into sov_snapshot(snapshot_date,brand,popularity,mentions,geo,source)
        values(${snapshotDate},${brand},${popularity},${Number.isFinite(mentions) ? mentions : null},'ID','Brand24 popularity index')
        on conflict(snapshot_date,brand,geo) do update set popularity=excluded.popularity,mentions=excluded.mentions,source=excluded.source
      `;
      written += 1;
    }
    try {
      const projectsPayload = await gateway.call('brand24_get_projects', {});
      for (const project of records({ data: projectsPayload.projects ?? projectsPayload.data ?? [] })) {
        const brand = String(project.name ?? project.brand ?? '');
        if (!TRACKED_PROJECTS.includes(brand)) continue;
        const projectId = project.id ?? project.project_id;
        const stats = await gateway.call('brand24_project_stats', { project_id: projectId });
        const mentions = Number(stats.mentions ?? stats.mentions_count ?? (stats.data as Row | undefined)?.mentions);
        if (!Number.isFinite(mentions)) continue;
        await sql`
          insert into sov_snapshot(snapshot_date,brand,popularity,mentions,geo,source)
          values(${snapshotDate},${brand},null,${mentions},'ID','Brand24 tracked project')
          on conflict(snapshot_date,brand,geo) do update set mentions=excluded.mentions,
            popularity=coalesce(sov_snapshot.popularity,excluded.popularity)
        `;
        written += 1;
      }
    } catch {
      // Popularity snapshot remains valid if tracked-project mention detail is unavailable.
    }
    await sql`
      insert into source_state(source,status,message,last_success_at,updated_at)
      values('brand24','connected',${`Brand24 rolling snapshot stored for ${snapshotDate}.`},now(),now())
      on conflict(source) do update set status=excluded.status,message=excluded.message,last_success_at=now(),updated_at=now()
    `;
    return written;
  } finally { await gateway.close(); }
}
