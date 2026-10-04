import {loadEnvConfig} from '@next/env';
import {readFileSync,readdirSync} from 'node:fs';
import postgres from 'postgres';
import {PGlite} from '@electric-sql/pglite';
import {readMigrationFiles} from 'drizzle-orm/migrator';

class BaselineError extends Error {}
const queries={
  columns:`SELECT c.relname AS table_name,a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,
    a.attnotnull AS required,pg_get_expr(d.adbin,d.adrelid) AS default_value,c.relrowsecurity AS rls
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE n.nspname='langlab' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attname`,
  constraints:`SELECT c.relname AS table_name,k.conname AS name,k.contype AS kind,
    pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='langlab' AND k.contype<>'n' ORDER BY c.relname,k.contype,k.conname`,
  indexes:`SELECT c.relname AS table_name,pg_get_indexdef(i.indexrelid) AS definition
    FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='langlab' AND NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conindid=i.indexrelid) ORDER BY c.relname,i.indexrelid`,
  policies:`SELECT tablename,policyname,permissive,roles::text,cmd,qual,with_check FROM pg_policies
    WHERE schemaname='langlab' ORDER BY tablename,policyname`,
  triggers:`SELECT c.relname AS table_name,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='langlab' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,
  functions:`SELECT p.proname,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='langlab' ORDER BY p.proname`,
  grants:`SELECT table_name,grantee,privilege_type FROM information_schema.table_privileges
    WHERE table_schema='langlab' AND grantee IN ('anon','authenticated','service_role','PUBLIC') ORDER BY table_name,grantee,privilege_type`,
};
type Row=Record<string,unknown>;
function canonical(rows:Row[],omitName=false) {
  return rows.map(row=>JSON.stringify(Object.fromEntries(Object.entries(row).filter(([key])=>!omitName||key!=='name')
    .map(([key,value])=>[key,typeof value==='string'?value.replaceAll('\r\n','\n'):value])))).sort().join('\n');
}
async function main(){
  loadEnvConfig(process.cwd());
  if(!process.env.DATABASE_URL) throw new BaselineError('DATABASE_URL is missing.');
  const client=postgres(process.env.DATABASE_URL,{prepare:false,max:1,connect_timeout:10});
  const expected=new PGlite();
  try {
    await expected.exec(`CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT null::uuid';`);
    const entries=readMigrationFiles({migrationsFolder:'./drizzle'}).slice(0,2);
    // Baseline only the two reviewed initial migrations, never future migrations.
    if(entries.length!==2) throw new BaselineError('Baseline supports only the two initial migrations.');
    for(const name of readdirSync('./drizzle').filter(name=>/^000[01]_.*\.sql$/.test(name)).sort())
      await expected.exec(readFileSync(`./drizzle/${name}`,'utf8'));
    await client.begin(async tx=>{
      await tx`SELECT pg_advisory_xact_lock(1791030)`;
      const [ledger]=await tx`SELECT to_regclass('langlab_migrations.journal') IS NOT NULL AS tracked`;
      if(ledger.tracked) throw new BaselineError('A migration ledger already exists. Use db:migrate.');
      const existingTables=await tx`SELECT tablename FROM pg_tables WHERE schemaname='langlab' ORDER BY tablename`;
      if(existingTables.length!==22) throw new BaselineError('Baseline requires the 22 existing foundation tables.');
      // Block concurrent changes while verifying and recording this baseline.
      for(const row of existingTables) await tx.unsafe(`LOCK TABLE langlab.${quote(row.tablename)} IN ACCESS EXCLUSIVE MODE`);
      let expectedConstraints:Row[]=[];let liveConstraints:Row[]=[];
      for(const [label,query] of Object.entries(queries)){
        const reference=(await expected.query<Row>(query)).rows;
        const live=Array.from(await tx.unsafe(query)) as Row[];
        if(canonical(reference,label==='constraints')!==canonical(live,label==='constraints')) {
          const omit=label==='constraints';
          console.log('Expected only:',reference.filter(row=>!live.some(item=>canonical([row],omit)===canonical([item],omit))));
          console.log('Existing only:',live.filter(row=>!reference.some(item=>canonical([row],omit)===canonical([item],omit))));
          throw new BaselineError(`Schema mismatch in ${label}; baseline cancelled without changes.`);
        }
        if(label==='constraints'){expectedConstraints=reference;liveConstraints=live;}
      }
      const expectedLanguages=(await expected.query<Row>('SELECT * FROM langlab.languages ORDER BY code')).rows;
      const expectedSkills=(await expected.query<Row>('SELECT * FROM langlab.skills ORDER BY code')).rows;
      for(const [table,rows] of [['languages',expectedLanguages],['skills',expectedSkills]] as const){
        const live=Array.from(await tx.unsafe(`SELECT * FROM langlab.${table} ORDER BY code`)) as Row[];
        if(!rows.every(row=>live.some(item=>canonical([item])===canonical([row]))))
          throw new BaselineError(`Missing foundation ${table}; baseline cancelled.`);
      }
      // Align constraint names so future code-generated drops/changes target them.
      for(const ref of expectedConstraints){
        const live=liveConstraints.find(row=>row.table_name===ref.table_name&&row.kind===ref.kind&&row.definition===ref.definition);
        if(live && live.name!==ref.name) await tx.unsafe(`ALTER TABLE langlab.${quote(String(ref.table_name))} RENAME CONSTRAINT ${quote(String(live.name))} TO ${quote(String(ref.name))}`);
      }
      await tx`CREATE SCHEMA langlab_migrations`;
      await tx`REVOKE ALL ON SCHEMA langlab_migrations FROM PUBLIC`;
      await tx`CREATE TABLE langlab_migrations.journal(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint)`;
      for(const entry of entries) await tx`INSERT INTO langlab_migrations.journal(hash,created_at) VALUES(${entry.hash},${entry.folderMillis})`;
    });
    console.log('Verified foundation baseline registered. Existing application data preserved.');
  } finally {await client.end();await expected.close();}
}
function quote(value:string){return '"'+value.replaceAll('"','""')+'"';}
void main().catch((error:unknown)=>{
  console.error(error instanceof BaselineError?error.message:'Baseline failed. No transaction changes committed.');
  if(error instanceof Error&&'code' in error&&typeof error.code==='string'&&/^[A-Z0-9_]+$/.test(error.code)) console.error('Error code:',error.code);
  process.exitCode=1;
});
