// Unit tests drive the real email-flow helper with a fake Auth client.
// Assert which API calls are allowed before/after verification; these tests send no email.
import test from "node:test";
import assert from "node:assert/strict";
import { createEmailAuthFlow, authErrorMessage } from "../src/lib/emailAuth.ts";

function fixture(mode = "recovery") {
  const calls = [];
  const auth = {
    async resetPasswordForEmail(email) {
      calls.push(["request", email]);
      return { error: null };
    },
    async resend(args) {
      calls.push(["resend", args]);
      return { error: null };
    },
    async verifyOtp(args) {
      calls.push(["verify", args]);
      return args.token === "123456"
        ? {
            data: {
              user: { id: "test-user" },
              session: { access_token: "test-only" },
            },
            error: null,
          }
        : { data: {}, error: { code: "otp_expired", message: "Invalid code" } };
    },
    async updateUser(args) {
      calls.push(["update", args]);
      return { error: null };
    },
    async signOut() {
      calls.push(["logout"]);
      return { error: null };
    },
  };
  return { calls, auth, flow: createEmailAuthFlow(auth, mode) };
}

test("password updates require successful recovery verification", async () => {
  const { flow, calls } = fixture();
  await assert.rejects(
    flow.savePassword("NewPassword!", "NewPassword!"),
    /Verify your email/,
  );
  await assert.rejects(flow.verifyCode("user@example.com", "999999"));
  await assert.rejects(
    flow.savePassword("NewPassword!", "NewPassword!"),
    /Verify your email/,
  );
  assert.equal(
    calls.some(([name]) => name === "update"),
    false,
  );
});
test("signup confirmation never enables password recovery", async () => {
  const { flow, calls } = fixture("signup");
  await flow.verifyCode("user@example.com", "123456");
  assert.equal(calls[0][1].type, "email");
  await assert.rejects(
    flow.savePassword("NewPassword!", "NewPassword!"),
    /Verify your email/,
  );
});
test("mismatched or short passwords never reach the update API", async () => {
  const { flow, calls } = fixture();
  await flow.verifyCode("user@example.com", "123456");
  await assert.rejects(flow.savePassword("short", "short"), /8 characters/);
  await assert.rejects(
    flow.savePassword("NewPassword!", "OtherPassword!"),
    /do not match/,
  );
  assert.equal(
    calls.some(([name]) => name === "update"),
    false,
  );
});
test("a successful password update consumes the local verification state", async () => {
  const { flow, calls } = fixture();
  await flow.verifyCode("user@example.com", "123456");
  assert.equal(calls[0][1].type, "recovery");
  await flow.savePassword("NewPassword!", "NewPassword!");
  await assert.rejects(
    flow.savePassword("AnotherPassword!", "AnotherPassword!"),
    /Verify your email/,
  );
  assert.equal(calls.filter(([name]) => name === "update").length, 1);
});
test("requesting a new code clears the previous verification", async () => {
  const { flow } = fixture();
  await flow.verifyCode("user@example.com", "123456");
  await flow.requestCode("other@example.com");
  await assert.rejects(
    flow.savePassword("NewPassword!", "NewPassword!"),
    /Verify your email/,
  );
});
test("an API password rejection allows correcting the password and retrying", async () => {
  const { flow, auth } = fixture();
  await flow.verifyCode("user@example.com", "123456");
  auth.updateUser = async () => ({ error: { code: "same_password" } });
  await assert.rejects(flow.savePassword("NewPassword!", "NewPassword!"));
  auth.updateUser = async () => ({ error: null });
  await flow.savePassword("AnotherPassword!", "AnotherPassword!");
});
test("logout failure does not report a successful password update as failed", async () => {
  const { flow, auth } = fixture();
  await flow.verifyCode("user@example.com", "123456");
  auth.signOut = async () => {
    throw new Error("offline");
  };
  await flow.savePassword("NewPassword!", "NewPassword!");
});
test("malformed email and code are stopped before any Auth request", async () => {
  const { flow, calls } = fixture();
  await assert.rejects(flow.requestCode("bad address"), /valid email/);
  await assert.rejects(
    flow.verifyCode("user@example.com", "abc123"),
    /numeric/,
  );
  assert.equal(calls.length, 0);
});
test("email limit and expired-code errors give actionable messages", () => {
  assert.match(
    authErrorMessage({ code: "over_email_send_rate_limit" }),
    /try again later/,
  );
  assert.match(authErrorMessage({ code: "otp_expired" }), /latest email/);
});
