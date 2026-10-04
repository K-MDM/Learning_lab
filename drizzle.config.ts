import {loadEnvConfig} from '@next/env';
import {defineConfig} from 'drizzle-kit';
loadEnvConfig(process.cwd());

export default defineConfig({
  dialect:'postgresql',
  schema:'./src/db/schema.ts',
  out:'./drizzle',
  schemaFilter:['langlab'],
  dbCredentials:{url:process.env.DATABASE_URL ?? ''},
  strict:true,
  verbose:false,
  migrations:{schema:'langlab_migrations',table:'journal'},
});
