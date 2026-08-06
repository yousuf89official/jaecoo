import 'dotenv/config';
import { z } from 'zod';
import { closeDb } from '../db/client.js';
import { ACCOUNTS } from '../api/_lib/constants.js';
import { importWacReportingHealthSnapshot } from '../ingestion/wac-paid.js';

const platform = z.enum(['meta', 'tiktok', 'google']);
const base = z.object({ platform, account_id: z.string() });
const inputSchema = z.object({
  accounts: z.array(base.extend({ account_name: z.string(), currency: z.literal('IDR'), timezone: z.literal('Asia/Jakarta') })),
  freshness: z.array(base.extend({
    latest_report_date: z.string(), latest_ingestion: z.string(), latest_freshness: z.string(), fact_count: z.union([z.string(), z.number()]),
  })),
  syncRuns: z.array(base.extend({
    window_start: z.string(), window_end: z.string(), status: z.string(), rows_written: z.union([z.string(), z.number()]),
    error: z.string().nullable().optional(), started_at: z.string(), completed_at: z.string().optional(),
  })),
  issues: z.array(base.extend({
    severity: z.string(), category: z.string(), detail: z.string(), detected_at: z.string(),
  })),
  schemaVersion: z.string().optional(),
  capturedAt: z.string().optional(),
});

function assertExactScope(rows: Array<{ platform: 'meta' | 'tiktok' | 'google'; account_id: string }>, label: string) {
  for (const row of rows) {
    if (row.account_id !== ACCOUNTS[row.platform]) throw new Error(`${label} contains an out-of-scope account for ${row.platform}`);
  }
}

async function readInput() {
  let body = '';
  for await (const chunk of process.stdin) body += chunk;
  if (!body.trim()) throw new Error('Expected one JSON payload on stdin');
  return inputSchema.parse(JSON.parse(body));
}

try {
  const input = await readInput();
  assertExactScope(input.accounts, 'accounts');
  assertExactScope(input.freshness, 'freshness');
  assertExactScope(input.syncRuns, 'syncRuns');
  assertExactScope(input.issues, 'issues');
  const expected = new Set((['meta', 'tiktok', 'google'] as const).map((key) => `${key}:${ACCOUNTS[key]}`));
  const supplied = new Set(input.accounts.map((row) => `${row.platform}:${row.account_id}`));
  if (supplied.size !== expected.size || [...expected].some((key) => !supplied.has(key))) {
    throw new Error('accounts must contain each exact Jaecoo paid account exactly once');
  }
  const result = await importWacReportingHealthSnapshot(input);
  console.log(JSON.stringify(result));
} finally {
  await closeDb();
}
