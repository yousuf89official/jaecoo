import postgres, { type Sql } from 'postgres';

let client: Sql | undefined;

export function getDb(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  client ??= postgres(url, {
    max: process.env.VERCEL ? 1 : 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return client;
}

export async function closeDb(): Promise<void> {
  if (client) await client.end({ timeout: 5 });
  client = undefined;
}
