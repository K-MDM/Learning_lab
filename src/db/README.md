# Code-first database

Edit `schema.ts` for tables, columns, relationships, indexes, checks and RLS policies.
It exports inferred TypeScript types for application code. Supabase Auth remains
managed by Supabase; these models only reference `auth.users`.

Run from the `server` directory:

```powershell
npm run db:generate
npm test
npm run db:inspect
npm run db:migrate
```

Generate creates versioned SQL from the TypeScript models. Commit both the model
changes and the generated `drizzle` migrations. Inspect/migrate need `DATABASE_URL`
in `server/.env`: use Supabase **Connect → Session pooler**, with the database
password. Keep this server-only secret out of Flutter, browser code and Git.
Use the TLS connection parameters supplied by Supabase.

Use migrations rather than `drizzle-kit push` for shared databases. The migrator
refuses an existing `langlab` schema without a Drizzle ledger. For the original
22-table foundation, run `npm run db:baseline` once. This compares the live schema,
constraints, indexes, RLS, policies, triggers, functions, grants and foundation seeds
against the initial migrations. It cancels on differences; on a match it aligns
constraint names and records migration hashes in a single transaction, preserving
application data. Then use `npm run db:migrate`. Do not run the old
`database/migrations/001_foundation.sql` and the Drizzle initial migration together.

Special PostgreSQL features (audit triggers, function permissions and seed data)
live in `0001_access_audit_and_seeds.sql`. Ordinary model changes need no hand-written
SQL; create a custom migration for changes to those special features.

`database()` in `index.ts` provides a lazy server-only typed query client. Existing
staff login still uses Supabase Auth and its authenticated RLS reads.
