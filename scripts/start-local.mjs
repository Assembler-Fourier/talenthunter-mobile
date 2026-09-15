import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  cli,
  containerEnv,
  localAdminConfig,
  privateLocalDir,
  projectRoot,
} from "./backend-env.mjs";

// Confirm the container engine and bind the local stack to this Mac before starting services.
const env = containerEnv();
const docker = (args) => spawnSync("docker", args, { env, encoding: "utf8" });
if (docker(["info", "--format", "{{.ServerVersion}}"]).status !== 0) {
  throw new Error("Start OrbStack (or your Docker-compatible runtime) first.");
}
const network = "talenthunter-local";
const current = docker(["network", "inspect", network]);
if (current.status === 0) {
  const options = JSON.parse(current.stdout)[0].Options;
  if (options["com.docker.network.bridge.host_binding_ipv4"] !== "127.0.0.1") {
    throw new Error(
      "The existing talenthunter-local network does not bind to loopback. Inspect it before continuing.",
    );
  }
} else {
  const created = docker([
    "network",
    "create",
    "-o",
    "com.docker.network.bridge.host_binding_ipv4=127.0.0.1",
    network,
  ]);
  if (created.status !== 0) throw new Error(created.stderr);
}
fs.mkdirSync(privateLocalDir, { recursive: true, mode: 0o700 });
// CLI startup output may contain development credentials, so retain it in a private file.
const log = path.join(privateLocalDir, "start.log");
const fd = fs.openSync(log, "w", 0o600);
console.log(
  "Starting local Supabase. The first run downloads container images; details are in .local/start.log.",
);
const result = spawnSync(cli, ["start", "--network-id", network], {
  cwd: projectRoot,
  env,
  stdio: ["ignore", fd, fd],
});
fs.closeSync(fd);
if (result.status !== 0)
  throw new Error(
    "Local Supabase could not start. Inspect .local/start.log (it may contain local credentials).",
  );
localAdminConfig();
console.log(
  "Local Supabase ready. API: http://127.0.0.1:54321 | Studio: http://127.0.0.1:54323 | Mail: http://127.0.0.1:54324",
);
console.log(
  "Run npm run local:seed for synthetic accounts, then npm run dev:local.",
);
