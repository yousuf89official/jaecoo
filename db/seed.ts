import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDb, getDb } from './client.js';

const here = dirname(fileURLToPath(import.meta.url));
const sql = getDb();
const seed = await readFile(join(here, 'seed.sql'), 'utf8');
await sql.unsafe(seed);
console.log('Seeded Jaecoo dimensions and verified source states');
await closeDb();
