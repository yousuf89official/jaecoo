import 'dotenv/config';
import readline from 'node:readline';
import { closeDb } from '../db/client.js';
import { importGoogleWebPayloads, type GoogleWebPayloads } from '../ingestion/google-web.js';

interface SnapshotInput {
  siteUrl: string;
  propertyId: string;
  start: string;
  end: string;
  payloads: GoogleWebPayloads;
}

function readOneLine(): Promise<string> {
  const input = readline.createInterface({ input: process.stdin, terminal: false });
  return new Promise((resolve, reject) => {
    input.once('line', (line) => { input.close(); resolve(line); });
    input.once('error', reject);
  });
}

async function main() {
  const input = JSON.parse(await readOneLine()) as SnapshotInput;
  if (input.siteUrl !== 'sc-domain:jaecoo.id' || input.propertyId !== '470554174') throw new Error('Google snapshot scope mismatch');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.start) || !/^\d{4}-\d{2}-\d{2}$/.test(input.end) || input.start > input.end) throw new Error('Invalid Google snapshot range');
  if (!input.payloads || typeof input.payloads !== 'object') throw new Error('Google snapshot payloads are required');
  const written = await importGoogleWebPayloads(input.start, input.end, input.payloads, 'authorized_snapshot');
  console.log(JSON.stringify({ written }, null, 2));
}

main().finally(closeDb).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
