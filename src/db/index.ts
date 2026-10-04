import 'server-only';
import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import * as schema from './schema';

let connection: ReturnType<typeof postgres> | undefined;
export function database() {
  const url=process.env.DATABASE_URL;
  if(!url)throw new Error('Database connection is not configured');
  connection??=postgres(url,{prepare:false,max:5,connect_timeout:10});
  return drizzle(connection,{schema});
}
