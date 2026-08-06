import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDb, getDb } from './client.js';

const here = dirname(fileURLToPath(import.meta.url));
const sql = getDb();
const migration = await readFile(join(here, 'migrations/001_initial.sql'), 'utf8');
await sql.unsafe(migration);
console.log('Applied db/migrations/001_initial.sql');
await closeDb();
