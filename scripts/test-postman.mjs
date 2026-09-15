// Runs the shareable collection with ordinary demo credentials in a temporary file.
// Only a sanitised summary survives; raw responses contain session tokens.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  hostedConfig,
  privateLocalDir,
  projectRoot,
  writePrivateJson,
} from "./backend-env.mjs";

// The collection requires the prepared Aisha/TalentHunter/IBAT dataset, not arbitrary accounts.
const cfg = hostedConfig();
const manifest = JSON.parse(
  fs.readFileSync(
    process.env.TALENTHUNTER_DEMO_ACCOUNTS ||
      path.join(privateLocalDir, "hosted-demo/accounts.json"),
    "utf8",
  ),
);
assert.equal(
  manifest.project,
  cfg.url,
  "Demo credentials must match the assessment project",
);
assert.equal(
  manifest.complete,
  true,
  "Demo fixture preparation must be complete",
);
const variables = { base_url: cfg.url, publishable_key: cfg.publicKey };
for (const [role, key] of [
  ["candidate", "aisha"],
  ["owner", "talenthunter"],
  ["other", "ibat"],
]) {
  assert.ok(
    manifest.users[key]?.email && manifest.users[key]?.password,
    "Missing ordinary demo login",
  );
  variables[`${role}_email`] = manifest.users[key].email;
  variables[`${role}_password`] = manifest.users[key].password;
}
// Newman reads credentials from a short-lived private environment file, outside source control.
fs.mkdirSync(privateLocalDir, { recursive: true, mode: 0o700 });
const temp = fs.mkdtempSync(path.join(privateLocalDir, "postman-run-"));
fs.chmodSync(temp, 0o700);
const environment = path.join(temp, "environment.json");
const resultFile = path.join(temp, "results.json");
fs.writeFileSync(
  environment,
  JSON.stringify({
    name: "Private local QA run",
    values: Object.entries(variables).map(([key, value]) => ({
      key,
      value,
      enabled: true,
    })),
  }),
  { mode: 0o600 },
);
let report;
try {
  console.log(
    "Running 17 Postman API requests with ordinary demo accounts. No business records are created or deleted.",
  );
  const result = spawnSync(
    "npx",
    [
      "--yes",
      "newman@6.2.1",
      "run",
      "tests/postman/TalentHunter.postman_collection.json",
      "-e",
      environment,
      "--timeout-request",
      "15000",
      "--reporters",
      "json",
      "--reporter-json-export",
      resultFile,
    ],
    { cwd: projectRoot, encoding: "utf8", timeout: 300000 },
  );
  if (!fs.existsSync(resultFile))
    throw new Error(
      "Newman could not write a result. Check npm/network availability.",
    );
  report = JSON.parse(fs.readFileSync(resultFile, "utf8"));
  // Keep assertion outcomes and timings, while excluding full Auth responses and tokens.
  const summary = {
    timestamp: new Date().toISOString(),
    project: cfg.url,
    requests: report.run.stats.requests,
    assertions: report.run.stats.assertions,
    scripts: report.run.stats.testScripts,
    failures: report.run.failures.map((f) => ({
      request: f.source?.name,
      test: f.error?.test,
      message: f.error?.message,
    })),
    timings: report.run.timings,
  };
  writePrivateJson("postman-summary.json", summary);
  for (const execution of report.run.executions) {
    const failures = summary.failures.filter(
      (f) => f.request === execution.item.name,
    );
    console.log(`${failures.length ? "FAIL" : "PASS"} ${execution.item.name}`);
  }
  console.log(
    `${summary.assertions.total - summary.assertions.failed}/${summary.assertions.total} assertions passed. Private summary: .local/postman-summary.json`,
  );
  process.exitCode =
    result.status === 0 && summary.failures.length === 0 ? 0 : 1;
} finally {
  // Also close any successful login if a later collection script failed before logout.
  for (const execution of report?.run.executions || []) {
    if (
      !execution.item.name.includes("Sign in") ||
      execution.response?.code !== 200
    )
      continue;
    const response = JSON.parse(
      Buffer.from(execution.response.stream.data).toString(),
    );
    if (response.access_token) {
      try {
        await fetch(`${cfg.url}/auth/v1/logout?scope=local`, {
          method: "POST",
          headers: {
            apikey: cfg.publicKey,
            Authorization: `Bearer ${response.access_token}`,
          },
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        console.log(
          "A temporary session could not be closed; its token will expire normally.",
        );
      }
    }
  }
  fs.rmSync(temp, { recursive: true, force: true });
}
