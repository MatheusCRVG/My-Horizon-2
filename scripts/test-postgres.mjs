import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgtap } from "@electric-sql/pglite-pgtap";

// The PostgreSQL WASM engine executes the actual migration and pgTAP SQL.
// Only auth.uid/role and auth.users are fixtures, in a fresh in-memory database.
// This does not simulate PostgREST, JWT signature verification or concurrent
// PostgreSQL connections; run the Supabase CLI suite before production rollout.
const root = fileURLToPath(new URL("../", import.meta.url));
const db = new PGlite({ extensions: { pgtap } });
try {
  await db.exec(`
    create schema auth;
    create schema extensions;
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create table auth.users(id uuid primary key, email text);
    grant usage on schema auth, extensions to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
        nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub')::uuid;
    $$;
    create function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'role';
    $$;
  `);
  const migrations = (await readdir(join(root, "supabase/migrations")))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of migrations) {
    await db.exec(await readFile(join(root, "supabase/migrations", name), "utf8"));
    console.log(`Applied ${name}`);
  }
  const tests = (await readdir(join(root, "supabase/tests")))
    .filter((name) => name.endsWith(".test.sql"))
    .sort();
  let count = 0;
  for (const name of tests) {
    const results = await db.exec(await readFile(join(root, "supabase/tests", name), "utf8"));
    const lines = results.flatMap((result) => result.rows.flatMap((row) =>
      Object.values(row).filter((value) => typeof value === "string")
        .flatMap((value) => value.split("\n"))));
    const assertions = lines.filter((line) => /^(?:not )?ok \d+/.test(line));
    const failures = lines.filter((line) => /^not ok|^# (?:Failed|Looks like)/.test(line));
    const plan = lines.find((line) => /^1\.\.\d+$/.test(line));
    if (!plan || Number(plan.slice(3)) !== assertions.length || failures.length) {
      for (const line of lines.filter((line) => /^not ok|^#/.test(line))) console.error(line);
      throw Error(`${name}: failed pgTAP assertions or incomplete TAP plan`);
    }
    count += assertions.length;
    console.log(`${name}: ${assertions.length} SQL assertions passed`);
  }
  const leftovers = await db.query("select count(*)::int as count from auth.users");
  if (leftovers.rows[0].count !== 0) throw Error("Test identities were not rolled back");
  if (!tests.length) throw Error("No SQL tests found");
  console.log(`PostgreSQL/WASM: ${count} assertions passed; test identities rolled back.`);
  console.log("Supabase services, signed JWT integration and multi-connection concurrency remain separate checks.");
} catch (error) {
  console.error(`PostgreSQL validation failed: ${error.code ? `${error.code}: ` : ""}${error.message}`);
  process.exitCode = 1;
} finally {
  await db.close();
}
