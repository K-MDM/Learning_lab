import {loadEnvConfig} from '@next/env';
import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import {migrate} from 'drizzle-orm/postgres-js/migrator';
class ConfigurationError extends Error {}

async function main() {
loadEnvConfig(process.cwd());
const url=process.env.DATABASE_URL;
if(!url) throw new ConfigurationError('Add DATABASE_URL to server/.env using the Supabase PostgreSQL session pooler connection string.');
const client=postgres(url,{prepare:false,max:1,connect_timeout:10});
try {
  // Refuse to re-create a schema originally installed using the legacy SQL.
  const [state]=await client`SELECT
    (SELECT count(*)::int FROM pg_tables WHERE schemaname='langlab') AS tables,
    to_regclass('langlab_migrations.journal') IS NOT NULL AS tracked`;
  if(state.tables>0 && !state.tracked) throw new ConfigurationError('Existing untracked langlab schema detected. Run npm run db:baseline to verify and register it; no changes were made.');
  await migrate(drizzle(client),{migrationsFolder:'./drizzle',migrationsSchema:'langlab_migrations',migrationsTable:'journal'});
  console.log('Drizzle migrations applied successfully.');
} finally {await client.end();}
}

void main().catch((error: unknown) => {
  // Database driver errors can contain credentials; keep CLI output secret-safe.
  console.error(error instanceof ConfigurationError ? error.message : 'Migration failed. Check DATABASE_URL and database connectivity.');
  if(error instanceof Error && 'code' in error && typeof error.code==='string' && /^[A-Z0-9_]+$/.test(error.code)) console.error('Error code:',error.code);
  process.exitCode=1;
});
