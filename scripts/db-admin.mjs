// Run only from a trusted terminal. Configuration lives outside this repository.
import fs from "node:fs";
import pg from "pg";
import { requireLoopback } from "./backend-env.mjs";
export function setupConfig() {
  if (!process.env.SUPABASE_SETUP_CONFIG)
    throw new Error("Set SUPABASE_SETUP_CONFIG to a private JSON config file.");
  return JSON.parse(fs.readFileSync(process.env.SUPABASE_SETUP_CONFIG, "utf8"));
}
export async function database() {
  // Local tooling uses verified loopback endpoints; hosted connections verify the server CA.
  const config = setupConfig();
  if (config.environment === "local") {
    const api = requireLoopback(config.url, 54321);
    const dbUrl = requireLoopback(config.dbConnectionString, 54322);
    if (api.protocol !== "http:" || dbUrl.protocol !== "postgresql:")
      throw new Error("Unexpected local protocol.");
    const client = new pg.Client({
      connectionString: config.dbConnectionString,
      ssl: false,
      connectionTimeoutMillis: 10000,
    });
    await client.connect();
    return client;
  }
  if (!process.env.SUPABASE_CA_CERT)
    throw new Error(
      "Set SUPABASE_CA_CERT to the official Supabase CA certificate.",
    );
  const ref = new URL(config.url).hostname.split(".")[0];
  const client = new pg.Client({
    host: `db.${ref}.supabase.co`,
    user: "postgres",
    database: "postgres",
    port: 5432,
    password: config.dbPassword,
    ssl: {
      rejectUnauthorized: true,
      ca: fs.readFileSync(process.env.SUPABASE_CA_CERT, "utf8"),
    },
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  return client;
}
