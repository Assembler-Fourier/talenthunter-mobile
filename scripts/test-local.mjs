import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  localAdminConfig,
  privateLocalDir,
  projectRoot,
} from "./backend-env.mjs";

// Reuse the integration suite with local-only credentials; --keep retains its demo fixtures.
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--keep"))
  throw new Error("Only --keep is supported.");
const keep = args.includes("--keep");
const configPath = localAdminConfig();
const result = spawnSync(process.execPath, ["tests/live-security.mjs"], {
  cwd: projectRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    SUPABASE_SETUP_CONFIG: configPath,
    KEEP_DEMO_FIXTURES: keep ? "1" : "0",
    SUPABASE_TEST_REPORT: path.join(privateLocalDir, "security-results.json"),
    SUPABASE_DEMO_ACCOUNTS: path.join(privateLocalDir, "demo-accounts.json"),
  },
});
if (result.status === 0 && keep)
  console.log(
    "Synthetic local logins are in .local/demo-accounts.json. Hosted accounts are separate.",
  );
process.exitCode = result.status ?? 1;
