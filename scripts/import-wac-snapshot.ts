import 'dotenv/config';
import readline from 'node:readline';
import { ACCOUNTS } from '../api/_lib/constants.js';
import { closeDb, getDb } from '../db/client.js';
import { extractFacts } from '../ingestion/normalize.js';
import { extractPageSummary, reconcileAccountSummary, upsertFact } from '../ingestion/wac-paid.js';

type Platform = keyof typeof ACCOUNTS;
type EntityType = 'account' | 'campaign' | 'ad';

interface SnapshotReport {
  platform: Platform;
  entityType: EntityType;
  start: string;
  end: string;
  payload: Record<string, unknown>;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PLATFORMS = new Set<Platform>(['meta', 'tiktok', 'google']);
const ENTITY_TYPES = new Set<EntityType>(['account', 'campaign', 'ad']);

function readOneLine(): Promise<string> {
  const input = readline.createInterface({ input: process.stdin, terminal: false });
  return new Promise((resolve, reject) => {
    input.once('line', (line) => { input.close(); resolve(line); });
    input.once('error', reject);
  });
}

function parseReports(line: string): SnapshotReport[] {
  const parsed = JSON.parse(line) as { reports?: SnapshotReport[] };
  if (!Array.isArray(parsed.reports) || !parsed.reports.length) throw new Error('reports must be a non-empty array');
  return parsed.reports.map((report) => {
    if (!report || !PLATFORMS.has(report.platform)) throw new Error('unsupported platform in snapshot');
    if (!ENTITY_TYPES.has(report.entityType)) throw new Error('unsupported entity type in snapshot');
    if (!ISO_DATE.test(report.start) || !ISO_DATE.test(report.end) || report.start > report.end) throw new Error('invalid snapshot date range');
    if (!report.payload || typeof report.payload !== 'object') throw new Error('snapshot payload is required');
    return report;
  });
}

async function importReport(report: SnapshotReport) {
  const sql = getDb();
  const facts = extractFacts(report.payload);
  const expectedAccount = ACCOUNTS[report.platform];
  for (const fact of facts) {
    if (fact.platform !== report.platform || fact.account_id !== expectedAccount || fact.entity_type !== report.entityType) {
      throw new Error(`snapshot scope mismatch for ${report.platform}/${report.entityType}`);
    }
    const reportDate = String(fact.report_date).slice(0, 10);
    if (reportDate < report.start || reportDate > report.end) throw new Error(`snapshot date outside declared range for ${report.platform}`);
  }

  const created = await sql`
    insert into ingestion_run(source,account_id,window_start,window_end,status)
    values(${`wac_snapshot:${report.platform}:${report.entityType}`},${expectedAccount},${report.start},${report.end},'running')
    returning id
  `;
  const runId = Number(created[0].id);
  try {
    for (const fact of facts) await upsertFact(fact);
    await sql`update ingestion_run set status='complete',rows_written=${facts.length},finished_at=now() where id=${runId}`;
    return { facts: facts.length, pageSummary: report.entityType === 'account' ? extractPageSummary(report.payload) : null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await sql`update ingestion_run set status='failed',error=${message.slice(0, 4000)},finished_at=now() where id=${runId}`;
    throw error;
  }
}

async function main() {
  const reports = parseReports(await readOneLine());
  const summaries = new Map<Platform, { start: string; end: string; pageSummary: Record<string, number> }>();
  const written: Record<string, number> = {};

  for (const report of reports) {
    const result = await importReport(report);
    written[`${report.platform}:${report.entityType}`] = result.facts;
    if (result.pageSummary) summaries.set(report.platform, { start: report.start, end: report.end, pageSummary: result.pageSummary });
  }

  const sql = getDb();
  const reconciliations: Record<string, unknown> = {};
  for (const [platform, summary] of summaries) {
    const reconciliation = await reconcileAccountSummary(platform, summary.start, summary.end, summary.pageSummary);
    reconciliations[platform] = reconciliation;
    const status = reconciliation.status === 'mismatch' ? 'qa_warning' : 'snapshot_imported';
    const message = reconciliation.status === 'mismatch'
      ? 'Authorized WAC snapshot imported, but stored account facts do not reconcile to page_summary.'
      : 'Authorized WAC performance_report snapshot imported and reconciled. Owner full-history reporting_sync is still required.';
    await sql`
      insert into source_state(source,status,message,details,last_success_at,updated_at)
      values(${`${platform}_paid`},${status},${message},${sql.json({ provenance: 'authorized_performance_report_snapshot', reconciliation })},now(),now())
      on conflict(source) do update set status=excluded.status,message=excluded.message,details=excluded.details,last_success_at=now(),updated_at=now()
    `;
  }

  console.log(JSON.stringify({ written, reconciliations }, null, 2));
}

main().finally(closeDb).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
