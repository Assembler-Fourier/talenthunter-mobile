import { spawn } from "node:child_process";
import {
  hostedConfig,
  localStatus,
  requirePublicKey,
  projectRoot,
} from "./backend-env.mjs";

// Select one backend before starting Expo/build commands; do not rewrite the user's .env.
const [mode, command, ...args] = process.argv.slice(2);
if (!["local", "hosted", "hosted-build"].includes(mode) || !command) {
  throw new Error(
    "Usage: node scripts/with-backend.mjs <local|hosted|hosted-build> <command> [arguments]",
  );
}
const local = mode === "local";
const status = local ? localStatus() : null;
const config = local
  ? {
      url: status.API_URL,
      publicKey: requirePublicKey(status.PUBLISHABLE_KEY || status.ANON_KEY),
    }
  : hostedConfig();
console.log(
  `Backend: ${local ? "LOCAL (this Mac)" : "HOSTED"} - ${config.url}`,
);
// Override all public backend values together and stop Expo loading a conflicting dotenv file.
const child = spawn(command, args, {
  cwd: projectRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    // Both preview modes use 127.0.0.1 in VS Code and native launchers.
    // Prefer IPv4 so localhost does not bind exclusively to ::1 on this Mac.
    NODE_OPTIONS:
      `${process.env.NODE_OPTIONS || ""} --dns-result-order=ipv4first`.trim(),
    EXPO_NO_DOTENV: "1",
    EXPO_PUBLIC_SUPABASE_URL: config.url,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.publicKey,
    EXPO_PUBLIC_BACKEND: local ? "local" : "hosted",
    TALENTHUNTER_HOSTED_BUILD: mode === "hosted-build" ? "1" : "",
  },
});
// Forward Ctrl+C/termination and the child exit status to the terminal or VS Code task.
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
