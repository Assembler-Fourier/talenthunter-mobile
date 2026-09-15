// Read-only checks of the prepared assessment demo. No administrator key needed.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { hostedConfig, projectRoot, writePrivateJson } from "./backend-env.mjs";
import { loadApplicantPage } from "../src/lib/applicantPage.ts";

const config = hostedConfig();
const accountFile =
  process.env.TALENTHUNTER_DEMO_ACCOUNTS ||
  path.join(projectRoot, ".local/hosted-demo/accounts.json");
if (!fs.existsSync(accountFile)) {
  throw new Error(
    "Prepared demo logins are missing. Supply the private account file through TALENTHUNTER_DEMO_ACCOUNTS; never commit it.",
  );
}
// Match the private manifest to the selected project before using any ordinary demo login.
const state = JSON.parse(fs.readFileSync(accountFile, "utf8"));
assert.equal(
  config.url,
  state.project,
  "The demo accounts belong to a different project.",
);
assert.equal(state.complete, true, "The demo preparation is incomplete.");
const catalog = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "scripts/demo-catalog.json"), "utf8"),
);
const clients = {};
const report = {
  timestamp: new Date().toISOString(),
  project: config.url,
  readOnly: true,
  checks: [],
};
const ok = (result) => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
async function check(name, run) {
  await run();
  report.checks.push({ name, result: "PASS" });
  console.log(`PASS ${name}`);
}
console.log(`HOSTED assessment: ${config.url}`);
console.log(
  "Uses ordinary demo logins. Reads existing records and files; does not create or delete them.",
);
try {
  for (const [key, user] of Object.entries(state.users)) {
    const client = createClient(config.url, config.publicKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    clients[key] = client;
    await check(`${user.name}: Auth login and own profile`, async () => {
      const signed = ok(
        await client.auth.signInWithPassword({
          email: user.email,
          password: user.password,
        }),
      );
      assert.equal(signed.user.id, user.id);
      const rows = ok(
        await client.from("profiles").select("id,role,full_name"),
      );
      assert.deepEqual(rows, [
        { id: user.id, role: user.role, full_name: user.name },
      ]);
    });
  }
  for (const person of catalog.candidates) {
    // Check record identities and file hashes, not just successful HTTP status codes.
    const client = clients[person.key];
    await check(
      `${person.name}: three jobs and two intended applications`,
      async () => {
        const jobs = ok(await client.from("jobs").select("id"));
        assert.deepEqual(
          jobs.map((j) => j.id).sort(),
          Object.values(state.jobs)
            .map((j) => j.id)
            .sort(),
        );
        const applications = ok(
          await client
            .from("applications")
            .select("job_id,resume_id,candidate_name"),
        );
        assert.deepEqual(
          applications.map((a) => a.job_id).sort(),
          person.appliesTo.map((k) => state.jobs[k].id).sort(),
        );
        assert.ok(
          applications.every(
            (a) =>
              a.resume_id === state.resumes[person.key].id &&
              a.candidate_name === person.name,
          ),
        );
      },
    );
    await check(
      `${person.name}: private Storage CV matches prepared bytes`,
      async () => {
        const resume = state.resumes[person.key];
        const file = ok(
          await client.storage.from("resumes").download(resume.storage_path),
        );
        assert.equal(
          createHash("sha256")
            .update(Buffer.from(await file.arrayBuffer()))
            .digest("hex"),
          resume.sha256,
        );
      },
    );
  }
  for (const job of catalog.jobs) {
    // Run the same applicant query as both recruiters to verify positive and negative access.
    await check(
      `${job.title}: owner sees ${job.expectedApplicants} applicants`,
      async () => {
        const result = await loadApplicantPage(
          clients[job.recruiter],
          state.jobs[job.key].id,
        );
        assert.equal(result.total, job.expectedApplicants);
        assert.equal(result.people.length, job.expectedApplicants);
        assert.equal(result.resumes.length, job.expectedApplicants);
      },
    );
    await check(
      `${job.title}: other recruiter sees zero applicants/count`,
      async () => {
        const other =
          job.recruiter === "talenthunter" ? "ibat" : "talenthunter";
        const result = await loadApplicantPage(
          clients[other],
          state.jobs[job.key].id,
        );
        assert.equal(result.total, 0);
        assert.deepEqual(result.people, []);
      },
    );
  }
  await check(
    "IBAT cannot download Aisha's unsubmitted CV or create a signed link",
    async () => {
      const bucket = clients.ibat.storage.from("resumes");
      assert.ok(
        (await bucket.download(state.resumes.aisha.storage_path)).error,
      );
      assert.ok(
        (await bucket.createSignedUrl(state.resumes.aisha.storage_path, 60))
          .error,
      );
    },
  );
  await check(
    "TalentHunter recruiter can open Aisha's submitted PDF",
    async () => {
      const signed = ok(
        await clients.talenthunter.storage
          .from("resumes")
          .createSignedUrl(state.resumes.aisha.storage_path, 60),
      );
      const response = await fetch(signed.signedUrl);
      assert.equal(response.ok, true);
      assert.equal(
        createHash("sha256")
          .update(Buffer.from(await response.arrayBuffer()))
          .digest("hex"),
        state.resumes.aisha.sha256,
      );
    },
  );
  report.completed = true;
  console.log(
    `Hosted connection verified: ${report.checks.length} checks passed.`,
  );
} catch (error) {
  report.completed = false;
  console.error(
    "Hosted check failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exitCode = 1;
} finally {
  // Release only the sessions opened by this script; other app sessions remain.
  await Promise.allSettled(
    Object.values(clients).map((c) => c.auth.signOut({ scope: "local" })),
  );
  writePrivateJson("hosted-connection-results.json", report);
}
