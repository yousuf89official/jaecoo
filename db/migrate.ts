import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDb, getDb } from './client.js';

const here = dirname(fileURLToPath(import.meta.url));
const sql = getDb();
const directory = join(here, 'migrations');
const migrations = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
for (const file of migrations) {
  await sql.unsafe(await readFile(join(directory, file), 'utf8'));
  console.log(`Applied db/migrations/${file}`);
}
await closeDb();
