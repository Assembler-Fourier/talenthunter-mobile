import { spawnSync } from "node:child_process";
import { cli, containerEnv, projectRoot } from "./backend-env.mjs";
// Default stop preserves local data volumes; never add --no-backup here.
const result = spawnSync(cli, ["stop"], {
  cwd: projectRoot,
  env: containerEnv(),
  stdio: "inherit",
});
process.exitCode = result.status ?? 1;
