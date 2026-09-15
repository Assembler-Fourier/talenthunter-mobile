// Exercises real local signup/confirmation through Mailpit; no external email.
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { localAdminConfig, writePrivateJson } from "../scripts/backend-env.mjs";

const config = JSON.parse(fs.readFileSync(localAdminConfig(), "utf8"));
const mailOrigin = "http://127.0.0.1:54324";
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const client = createClient(config.url, config.publicKey, options);
const admin = createClient(config.url, config.secretKey, options);
const email = `th.confirmation.${randomUUID()}@example.com`;
const password = `Local-${randomUUID()}!`;
const checks = [];
let userId;
let messageId;

function ok(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
function passed(name) {
  checks.push({ name, result: "PASS" });
  console.log(`PASS ${name}`);
}
async function mailJson(path) {
  const response = await fetch(`${mailOrigin}${path}`, {
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200, "Mailpit API must respond successfully");
  return response.json();
}

try {
  const signup = ok(
    await client.auth.signUp({
      email,
      password,
      options: { data: { role: "candidate", full_name: "Local Email Test" } },
    }),
  );
  userId = signup.user?.id;
  assert.ok(userId);
  assert.equal(signup.session, null);
  assert.ok(!signup.user.email_confirmed_at);
  passed("Public signup creates an unconfirmed account without a session");

  const premature = await client.auth.signInWithPassword({ email, password });
  assert.equal(premature.error?.code, "email_not_confirmed");
  passed("Sign-in is rejected before email confirmation");

  for (let attempt = 0; attempt < 20 && !messageId; attempt++) {
    const result = await mailJson(
      `/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    messageId = result.messages?.find((message) =>
      message.To.some((recipient) => recipient.Address === email),
    )?.ID;
    if (!messageId) await delay(500);
  }
  assert.ok(messageId, "Confirmation email must arrive in local Mailpit");
  const message = await mailJson(`/api/v1/message/${messageId}`);
  assert.match(message.Subject, /confirm/i);
  passed("Mailpit captures the signup confirmation email locally");

  const token = message.HTML.match(
    /id="verification-code">\s*(\d{6,10})\s*</,
  )?.[1];
  assert.ok(token, "Email must contain a confirmation code");
  ok(await client.auth.verifyOtp({ email, token, type: "email" }));
  passed("The delivered confirmation code is accepted by Supabase Auth");

  const session = ok(await client.auth.signInWithPassword({ email, password }));
  assert.equal(session.user.id, userId);
  assert.ok(session.user.email_confirmed_at);
  passed("The confirmed account can sign in through the public client");

  const profile = ok(await client.from("profiles").select("*").single());
  assert.equal(profile.id, userId);
  assert.equal(profile.role, "candidate");
  assert.equal(profile.full_name, "Local Email Test");
  passed("Confirmed signup has the expected candidate profile");
} finally {
  await client.auth.signOut();
  if (userId) ok(await admin.auth.admin.deleteUser(userId));
  if (messageId) {
    const response = await fetch(`${mailOrigin}/api/v1/messages`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ IDs: [messageId] }),
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, 200, "Only this test's email is removed");
  }
}
writePrivateJson("email-results.json", {
  timestamp: new Date().toISOString(),
  checks,
  fixturesCleaned: true,
});
console.log(
  "Local confirmation checks passed; this test's account and email were cleaned up.",
);
