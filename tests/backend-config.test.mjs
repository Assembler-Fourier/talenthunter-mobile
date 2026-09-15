// Configuration unit tests use temporary env files; no real Supabase connection is opened.
// Verify that hosted/local endpoints and public/admin credentials cannot be mixed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  hostedConfig,
  requireLoopback,
  requirePublicKey,
} from "../scripts/backend-env.mjs";

function withEnv(url, key, run) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "talenthunter-config-"),
  );
  const file = path.join(directory, ".env");
  fs.writeFileSync(
    file,
    `EXPO_PUBLIC_SUPABASE_URL=${url}\nEXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${key}\n`,
  );
  try {
    run(file);
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
}

test("hosted configuration requires a cloud HTTPS URL", () => {
  withEnv("https://example.supabase.co", "sb_publishable_test_only", (file) =>
    assert.equal(hostedConfig(file).url, "https://example.supabase.co"),
  );
});
test("a loopback URL cannot become a submitted hosted build", () => {
  withEnv("http://127.0.0.1:54321", "sb_publishable_test_only", (file) =>
    assert.throws(() => hostedConfig(file)),
  );
});
test("HTTP cloud and credential-bearing URLs are rejected", () => {
  for (const url of [
    "http://example.supabase.co",
    "https://user:password@example.supabase.co",
  ]) {
    withEnv(url, "sb_publishable_test_only", (file) =>
      assert.throws(() => hostedConfig(file)),
    );
  }
});
test("privileged keys cannot enter an app build", () => {
  assert.throws(() => requirePublicKey("sb_secret_test_only"));
  const payload = Buffer.from(
    JSON.stringify({ role: "service_role" }),
  ).toString("base64url");
  assert.throws(() => requirePublicKey(`header.${payload}.signature`));
});
test("a legacy anon key remains compatible", () => {
  const payload = Buffer.from(JSON.stringify({ role: "anon" })).toString(
    "base64url",
  );
  const key = `header.${payload}.signature`;
  assert.equal(requirePublicKey(key), key);
});
test("local admin access refuses remote hosts and unexpected ports", () => {
  assert.throws(() =>
    requireLoopback(
      "postgresql://postgres:postgres@db.example.supabase.co:54322/postgres",
      54322,
    ),
  );
  assert.throws(() => requireLoopback("http://127.0.0.1:54321", 54322));
  assert.equal(
    requireLoopback(
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      54322,
    ).hostname,
    "127.0.0.1",
  );
});
