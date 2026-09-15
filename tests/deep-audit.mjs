// Local-only exploratory security checks. Never targets the employer's website.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  localAdminConfig,
  privateLocalDir,
  requireLoopback,
} from "../scripts/backend-env.mjs";
import { database } from "../scripts/db-admin.mjs";
import { pdfBytes } from "./fixtures.mjs";
import { loadApplicantPage } from "../src/lib/applicantPage.ts";

const configPath = localAdminConfig();
process.env.SUPABASE_SETUP_CONFIG = configPath;
const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
requireLoopback(cfg.url, 54321);
const makeClient = (key = cfg.publicKey) =>
  createClient(cfg.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const admin = makeClient(cfg.secretKey);
const users = [];
const paths = [];
const report = {
  timestamp: new Date().toISOString(),
  environment: "local",
  checks: [],
  observations: [],
};
function ok(result) {
  if (result.error) throw result.error;
  return result.data;
}
async function check(name, action) {
  try {
    await action();
    report.checks.push({ name, result: "PASS" });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, result: "FAIL", reason: error.message });
    throw error;
  }
}
async function counts() {
  const result = {};
  for (const table of ["profiles", "jobs", "resumes", "applications"]) {
    const query = await admin
      .from(table)
      .select("id", { count: "exact", head: true });
    ok(query);
    result[table] = query.count;
  }
  return result;
}
async function user(role, name) {
  const email = `deep.${randomUUID()}@example.com`;
  const password = `Audit-${randomUUID()}!`;
  const record = ok(
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role, full_name: name },
    }),
  ).user;
  users.push(record.id);
  const api = makeClient();
  ok(await api.auth.signInWithPassword({ email, password }));
  return { id: record.id, api };
}
async function resume(owner, name) {
  const id = randomUUID();
  const storage_path = `${owner.id}/${id}.pdf`;
  paths.push(storage_path);
  ok(
    await owner.api.storage
      .from("resumes")
      .upload(storage_path, pdfBytes(name), { contentType: "application/pdf" }),
  );
  return ok(
    await owner.api
      .from("resumes")
      .insert({ id, storage_path, original_name: `${name}.pdf` })
      .select()
      .single(),
  );
}
const before = await counts();
try {
  const ra = await user("recruiter", "Deep Recruiter A");
  const rb = await user("recruiter", "Deep Recruiter B");
  const ca = await user("candidate", "Deep Candidate A");
  const cb = await user("candidate", "Deep Candidate B");
  const injectionText = "O'Brien'); DROP TABLE public.jobs; --";
  const ja = ok(
    await ra.api
      .from("jobs")
      .insert({
        title: injectionText,
        description: "Synthetic SQL-input audit",
        location: "Local",
      })
      .select()
      .single(),
  );
  const jb = ok(
    await rb.api
      .from("jobs")
      .insert({
        title: "Deep audit B",
        description: "Synthetic isolation audit",
        location: "Local",
      })
      .select()
      .single(),
  );
  await check(
    "SQL-like job text is stored literally and the jobs table remains readable",
    async () => {
      const rows = ok(
        await ca.api.from("jobs").select("id,title").eq("id", ja.id),
      );
      assert.equal(rows[0].title, injectionText);
    },
  );
  await check(
    "SQL-like input in a UUID filter errors rather than broadening the query",
    async () => {
      const query = await ca.api
        .from("jobs")
        .select("*")
        .eq("id", "' OR 1=1 --");
      assert.equal(query.error?.code, "22P02");
    },
  );
  await check(
    "All signed-in users can read job listings, including another recruiter's job",
    async () => {
      assert.equal(
        ok(await rb.api.from("jobs").select("id").eq("id", ja.id)).length,
        1,
      );
    },
  );
  await check("Anonymous users cannot read job listings", async () => {
    assert.ok((await makeClient().from("jobs").select("id")).error);
  });
  await check(
    "Changing Auth user metadata does not change the immutable database role",
    async () => {
      ok(await ca.api.auth.updateUser({ data: { role: "recruiter" } }));
      assert.equal(
        ok(await ca.api.from("profiles").select("role").single()).role,
        "candidate",
      );
      assert.ok(
        (
          await ca.api
            .from("jobs")
            .insert({ title: "forbidden", description: "x", location: "x" })
        ).error,
      );
    },
  );
  const oldResume = await resume(ca, "Audit-v1");
  await check(
    "Two simultaneous applications create exactly one application",
    async () => {
      const results = await Promise.all(
        [1, 2].map(() =>
          ca.api
            .from("applications")
            .insert({ job_id: ja.id, resume_id: oldResume.id }),
        ),
      );
      assert.equal(results.filter((r) => !r.error).length, 1);
      assert.equal(results.filter((r) => r.error?.code === "23505").length, 1);
    },
  );
  const application = ok(
    await ca.api.from("applications").select("*").eq("job_id", ja.id).single(),
  );
  for (const [label, api, expected] of [
    ["owning recruiter", ra.api, 1],
    ["other recruiter", rb.api, 0],
    ["applying candidate", ca.api, 1],
    ["other candidate", cb.api, 0],
  ]) {
    await check(
      `Exact applicant count visible to ${label} is ${expected}`,
      async () => {
        const result = await api
          .from("applications")
          .select("id", { count: "exact", head: true })
          .eq("job_id", ja.id);
        ok(result);
        assert.equal(result.count, expected);
      },
    );
  }
  await check(
    "Nested job/application query cannot reveal another recruiter's applicants",
    async () => {
      const result = ok(
        await rb.api
          .from("jobs")
          .select("id,applications(id,candidate_name)")
          .eq("id", ja.id)
          .single(),
      );
      assert.deepEqual(result.applications, []);
    },
  );
  await check(
    "Other recruiter cannot enumerate the candidate's storage folder",
    async () => {
      assert.equal(
        ok(await rb.api.storage.from("resumes").list(ca.id)).length,
        0,
      );
    },
  );
  const newResume = await resume(ca, "Audit-v2");
  await check(
    "Uploading CV v2 leaves the existing application pinned to v1",
    async () => {
      assert.equal(
        ok(
          await ca.api
            .from("applications")
            .select("resume_id")
            .eq("id", application.id)
            .single(),
        ).resume_id,
        oldResume.id,
      );
      assert.ok(
        (await ra.api.storage.from("resumes").download(newResume.storage_path))
          .error,
      );
    },
  );
  await check(
    "Submitting v2 to Recruiter B grants only the submitted version to B",
    async () => {
      ok(
        await ca.api
          .from("applications")
          .insert({ job_id: jb.id, resume_id: newResume.id }),
      );
      ok(await rb.api.storage.from("resumes").download(newResume.storage_path));
      assert.ok(
        (await rb.api.storage.from("resumes").download(oldResume.storage_path))
          .error,
      );
      assert.ok(
        (await ra.api.storage.from("resumes").download(newResume.storage_path))
          .error,
      );
    },
  );
  await check(
    "Recruiter sees submitted name but cannot read candidate's profile row",
    async () => {
      assert.equal(
        ok(
          await ra.api
            .from("applications")
            .select("candidate_name")
            .eq("id", application.id)
            .single(),
        ).candidate_name,
        "Deep Candidate A",
      );
      assert.equal(
        ok(await ra.api.from("profiles").select("*").eq("id", ca.id)).length,
        0,
      );
    },
  );
  await check("Client cannot forge resume timestamps", async () => {
    const id = randomUUID();
    assert.ok(
      (
        await ca.api.from("resumes").insert({
          id,
          storage_path: `${ca.id}/${id}.pdf`,
          original_name: "forged.pdf",
          created_at: "2099-01-01T00:00:00Z",
        })
      ).error,
    );
  });
  await check(
    "A valid signed URL can be fetched without a user session (bearer access)",
    async () => {
      const link = ok(
        await ra.api.storage
          .from("resumes")
          .createSignedUrl(oldResume.storage_path, 60),
      );
      const response = await fetch(link.signedUrl);
      assert.equal(response.status, 200);
      assert.ok((await response.text()).startsWith("%PDF-"));
    },
  );
  const invalidId = randomUUID();
  const invalidPath = `${cb.id}/${invalidId}.pdf`;
  paths.push(invalidPath);
  const invalid = await cb.api.storage
    .from("resumes")
    .upload(invalidPath, Buffer.from("This is harmless text, not PDF bytes."), {
      contentType: "application/pdf",
    });
  if (!invalid.error) {
    ok(
      await cb.api.from("resumes").insert({
        id: invalidId,
        storage_path: invalidPath,
        original_name: "not-a-pdf.pdf",
      }),
    );
    const submitted = await cb.api
      .from("applications")
      .insert({ job_id: jb.id, resume_id: invalidId });
    report.observations.push({
      id: "AUD-01",
      status: "CONFIRMED LIMITATION",
      severity: "Medium for production",
      title: "Declared PDF MIME does not validate file content",
      detail: `Ordinary candidate uploaded harmless non-PDF bytes with application/pdf. Metadata saved. Application ${submitted.error ? "rejected" : "accepted"}. The client signature check is bypassable; no server content validation/scanning exists.`,
    });
    console.log(
      "CONFIRMED LIMITATION AUD-01: declared PDF MIME accepted harmless non-PDF bytes.",
    );
  } else {
    report.observations.push({
      id: "AUD-01",
      status: "NOT REPRODUCED",
      title: "Declared MIME bypass was rejected",
      detail: invalid.error.message,
    });
  }
  const pagingResume = await resume(cb, "Paging-CV");
  ok(
    await cb.api
      .from("applications")
      .insert({ job_id: ja.id, resume_id: pagingResume.id }),
  );
  const firstPage = await loadApplicantPage(ra.api, ja.id, 0, 1);
  const secondPage = await loadApplicantPage(ra.api, ja.id, 1, 1);
  await check(
    "Applicant page helper reports the exact total and distinct ordered pages",
    async () => {
      assert.equal(firstPage.total, 2);
      assert.equal(secondPage.total, 2);
      assert.equal(firstPage.people.length, 1);
      assert.equal(secondPage.people.length, 1);
      assert.notEqual(firstPage.people[0].id, secondPage.people[0].id);
      assert.ok(
        firstPage.people[0].created_at >= secondPage.people[0].created_at,
      );
      assert.equal(firstPage.resumes[0].id, firstPage.people[0].resume_id);
    },
  );
  await check(
    "Applicant page beyond the end is empty but retains the exact total",
    async () => {
      const result = await loadApplicantPage(ra.api, ja.id, 2, 1);
      assert.equal(result.total, 2);
      assert.deepEqual(result.people, []);
      assert.deepEqual(result.resumes, []);
    },
  );
  await check(
    "Applicant pagination and counts remain hidden from another recruiter",
    async () => {
      const result = await loadApplicantPage(rb.api, ja.id, 0, 1);
      assert.equal(result.total, 0);
      assert.deepEqual(result.people, []);
      assert.deepEqual(result.resumes, []);
    },
  );
  await check(
    "Applicant pagination rejects negative and excessive page parameters",
    async () => {
      await assert.rejects(loadApplicantPage(ra.api, ja.id, -1));
      await assert.rejects(loadApplicantPage(ra.api, ja.id, 0, 101));
    },
  );
} finally {
  const cleanupErrors = [];
  if (paths.length) {
    const r = await admin.storage.from("resumes").remove(paths);
    if (r.error) cleanupErrors.push(r.error.message);
  }
  const db = await database();
  try {
    await db.query(
      "delete from public.applications where candidate_id=any($1::uuid[])",
      [users],
    );
    await db.query(
      "delete from public.resumes where candidate_id=any($1::uuid[])",
      [users],
    );
    await db.query(
      "delete from public.jobs where recruiter_id=any($1::uuid[])",
      [users],
    );
  } finally {
    await db.end();
  }
  for (const id of users) {
    const r = await admin.auth.admin.deleteUser(id);
    if (r.error) cleanupErrors.push(r.error.message);
  }
  const after = await counts();
  report.cleanup = { before, after, errors: cleanupErrors };
  fs.writeFileSync(
    path.join(privateLocalDir, "deep-audit-results.json"),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  assert.deepEqual(cleanupErrors, []);
  assert.deepEqual(
    after,
    before,
    "Fixture cleanup must preserve pre-existing row counts",
  );
  console.log("PASS audit fixture cleanup preserved the original data counts.");
}
