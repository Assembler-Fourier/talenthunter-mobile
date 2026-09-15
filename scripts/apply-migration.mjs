// One-time schema setup for an empty assessment database; never part of normal app startup.
import fs from "node:fs";
import { database, setupConfig } from "./db-admin.mjs";
const db = await database();
try {
  const existing = await db.query(
    "select tablename from pg_tables where schemaname = 'public'",
  );
  if (existing.rows.length)
    throw new Error(
      "Initial migration requires an empty public schema. Inspect existing tables first.",
    );
  await db.query(
    fs.readFileSync(
      new URL(
        "../supabase/migrations/202609140001_initial.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  console.log(
    setupConfig().environment === "local"
      ? "Initial migration applied over local loopback."
      : "Initial migration applied with verified TLS.",
  );
  console.log(
    (
      await db.query(
        "select tablename, rowsecurity from pg_tables where schemaname='public' order by tablename",
      )
    ).rows,
  );
} finally {
  await db.end();
}
