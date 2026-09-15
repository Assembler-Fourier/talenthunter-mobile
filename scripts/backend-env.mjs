import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { execFileSync } from "node:child_process";

// Resolve paths from this file, so commands work independently of the terminal's location.
export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export const privateLocalDir = path.join(projectRoot, ".local");
export const cli = path.join(projectRoot, "node_modules/.bin/supabase");
const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function requirePublicKey(key) {
  // App bundles are readable: reject privileged keys before Expo can embed them.
  if (typeof key !== "string")
    throw new Error("A publishable/anon client key is required.");
  if (key.startsWith("sb_publishable_")) return key;
  if (key.split(".").length === 3) {
    try {
      const payload = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString(),
      );
      if (payload.role === "anon") return key;
    } catch {
      /* Invalid JWTs are rejected below. */
    }
  }
  throw new Error(
    "Only a publishable key or legacy anon key may enter the app.",
  );
}

export function hostedConfig(envFile = path.join(projectRoot, ".env")) {
  // Release/demo configuration must explicitly target the hosted HTTPS project.
  const values = parseEnv(fs.readFileSync(envFile, "utf8"));
  const url = new URL(values.EXPO_PUBLIC_SUPABASE_URL);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".supabase.co") ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "Hosted builds require an HTTPS Supabase project URL in .env.",
    );
  }
  return {
    url: url.origin,
    publicKey: requirePublicKey(values.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  };
}

export function requireLoopback(value, expectedPort) {
  // Local test/setup tools must never silently target a remote database.
  const url = new URL(value);
  if (!loopbackHosts.has(url.hostname) || url.port !== String(expectedPort)) {
    throw new Error(`Local setup must use loopback port ${expectedPort}.`);
  }
  return url;
}

// Resolve the selected Docker context without changing it for other projects.
export function containerEnv() {
  if (process.env.DOCKER_HOST) return { ...process.env };
  const context =
    process.env.DOCKER_CONTEXT ||
    execFileSync("docker", ["context", "show"], { encoding: "utf8" }).trim();
  const host = execFileSync(
    "docker",
    ["context", "inspect", context, "--format", "{{.Endpoints.docker.Host}}"],
    { encoding: "utf8" },
  ).trim();
  return {
    ...process.env,
    DOCKER_HOST: host,
    SUPABASE_TELEMETRY_DISABLED: "1",
  };
}

export function localStatus() {
  // Ask the installed CLI for current endpoints instead of copying stale container keys.
  const result = JSON.parse(
    execFileSync(cli, ["status", "--output", "json"], {
      cwd: projectRoot,
      env: containerEnv(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  requireLoopback(result.API_URL, 54321);
  requireLoopback(result.DB_URL, 54322);
  return result;
}

export function writePrivateJson(name, value) {
  // Runtime credentials and reports stay in the ignored directory with owner-only file access.
  fs.mkdirSync(privateLocalDir, { recursive: true, mode: 0o700 });
  const target = path.join(privateLocalDir, name);
  fs.writeFileSync(target, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
  fs.chmodSync(target, 0o600);
  return target;
}

export function localAdminConfig() {
  // Elevated local credentials are for fixture setup only, not the mobile application's client.
  const status = localStatus();
  const secretKey = status.SECRET_KEY || status.SERVICE_ROLE_KEY;
  if (typeof secretKey !== "string" || !secretKey)
    throw new Error("Local CLI status did not provide an administrator key.");
  return writePrivateJson("admin.json", {
    environment: "local",
    url: status.API_URL,
    publicKey: requirePublicKey(status.PUBLISHABLE_KEY || status.ANON_KEY),
    secretKey,
    dbConnectionString: status.DB_URL,
  });
}
