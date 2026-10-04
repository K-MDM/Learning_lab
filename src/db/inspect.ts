import {loadEnvConfig} from '@next/env';
import postgres from 'postgres';
async function main() {
loadEnvConfig(process.cwd());
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
const client=postgres(process.env.DATABASE_URL,{prepare:false,max:1,connect_timeout:10});
try {
  const tables=await client`SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='langlab' ORDER BY tablename`;
  console.table(tables);
  const ledger=await client`SELECT to_regclass('langlab_migrations.journal') IS NOT NULL AS drizzle_migrations_tracked`;
  console.table(ledger);
} finally {await client.end();}
}

void main().catch((error: unknown) => {
  console.error('Database inspection failed. Check DATABASE_URL and PostgreSQL connectivity.');
  if(error instanceof Error && 'code' in error && typeof error.code==='string' && /^[A-Z0-9_]+$/.test(error.code)) console.error('Error code:',error.code);
  process.exitCode=1;
});
