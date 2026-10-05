import 'server-only';
import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import * as schema from './schema';

let connection: ReturnType<typeof postgres> | undefined;
export function database() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error('DATABASE_URL environment variable is not configured');
  const url = rawUrl.trim().replace(/^["']|["']$/g, '');
  connection ??= postgres(url, { prepare: false, max: 5, connect_timeout: 10, ssl: 'require' });
  return drizzle(connection, { schema });
}
