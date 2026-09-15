// Exercises real Supabase OTP/password APIs with disposable synthetic users.
// Admin-generated codes deliberately do not send mail: delivery is a separate test.
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { setupConfig } from "../scripts/db-admin.mjs";
import { createEmailAuthFlow } from "../src/lib/emailAuth.ts";

const config = setupConfig();
const options = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};
const client = () => createClient(config.url, config.publicKey, options);
const admin = createClient(config.url, config.secretKey, options);
const ids = [];
const checks = [];
function ok(result) {
  if (result.error) throw result.error;
  return result.data;
}
function pass(name) {
  checks.push({ name, result: "PASS" });
  console.log(`PASS ${name}`);
}

try {
  const email = `th.email-flow.${randomUUID()}@example.com`;
  const initialPassword = `Before-${randomUUID()}!`;
  const newPassword = `After-${randomUUID()}!`;
  const user = ok(
    await admin.auth.admin.createUser({
      email,
      password: initialPassword,
      email_confirm: true,
      user_metadata: { role: "candidate", full_name: "Email Flow Test" },
    }),
  ).user;
  ids.push(user.id);
  const recoveryClient = client();
  const normalClient = client();
  const flow = createEmailAuthFlow(recoveryClient.auth, "recovery");
  await assert.rejects(flow.savePassword(newPassword, newPassword));
  pass("Password save is blocked before code verification");

  const link = ok(
    await admin.auth.admin.generateLink({ type: "recovery", email }),
  );
  const code = link.properties.email_otp;
  assert.ok(code);
  const wrongCode = code === "000000" ? "111111" : "000000";
  await assert.rejects(flow.verifyCode(email, wrongCode));
  await assert.rejects(flow.savePassword(newPassword, newPassword));
  pass("A wrong code cannot authorize a password change");

  await flow.verifyCode(email, code);
  assert.equal(ok(await recoveryClient.auth.getUser()).user.id, user.id);
  assert.equal(ok(await normalClient.auth.getSession()).session, null);
  pass(
    "Recovery verifies the correct user without signing in the normal app client",
  );
  await assert.rejects(flow.savePassword(newPassword, "MismatchPassword!"));
  pass("Password confirmation mismatch is rejected");
  await flow.savePassword(newPassword, newPassword);
  const oldLogin = await normalClient.auth.signInWithPassword({
    email,
    password: initialPassword,
  });
  assert.ok(oldLogin.error);
  const newLogin = ok(
    await normalClient.auth.signInWithPassword({
      email,
      password: newPassword,
    }),
  );
  assert.equal(newLogin.user.id, user.id);
  pass("Old password fails and the new password signs into the same account");
  await assert.rejects(
    createEmailAuthFlow(client().auth, "recovery").verifyCode(email, code),
  );
  pass("A consumed recovery code cannot be reused");
  ok(await normalClient.auth.signOut());

  const signupEmail = `th.confirm-flow.${randomUUID()}@example.com`;
  const signupPassword = `Signup-${randomUUID()}!`;
  const signup = ok(
    await admin.auth.admin.generateLink({
      type: "signup",
      email: signupEmail,
      password: signupPassword,
      options: {
        data: { role: "recruiter", full_name: "Confirmation Flow Test" },
      },
    }),
  );
  ids.push(signup.user.id);
  assert.ok(
    (
      await client().auth.signInWithPassword({
        email: signupEmail,
        password: signupPassword,
      })
    ).error,
  );
  const confirmation = createEmailAuthFlow(client().auth, "signup");
  await confirmation.verifyCode(signupEmail, signup.properties.email_otp);
  await assert.rejects(confirmation.savePassword(newPassword, newPassword));
  const signedIn = client();
  ok(
    await signedIn.auth.signInWithPassword({
      email: signupEmail,
      password: signupPassword,
    }),
  );
  const profile = ok(
    await signedIn.from("profiles").select("role, full_name").single(),
  );
  assert.equal(profile.role, "recruiter");
  pass("Signup code confirms the account and preserves its recruiter role");
  await assert.rejects(
    createEmailAuthFlow(client().auth, "signup").verifyCode(
      signupEmail,
      signup.properties.email_otp,
    ),
  );
  pass("A consumed signup code cannot be reused");
  ok(await signedIn.auth.signOut());
} finally {
  for (const id of ids) ok(await admin.auth.admin.deleteUser(id));
}
fs.mkdirSync(".local", { recursive: true, mode: 0o700 });
fs.writeFileSync(
  ".local/email-auth-results.json",
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      checks,
      fixturesCleaned: true,
      limitation:
        "Admin-generated OTPs test Auth behavior, not SMTP delivery or email templates.",
    },
    null,
    2,
  ) + "\n",
  { mode: 0o600 },
);
console.log(
  `${checks.length} hosted email Auth checks passed; disposable users removed.`,
);
