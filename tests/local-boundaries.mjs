// Local-only boundary tests. Fixtures are disposable; existing records are preserved.
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import {
  localAdminConfig,
  requireLoopback,
  writePrivateJson,
} from "../scripts/backend-env.mjs";
import { database } from "../scripts/db-admin.mjs";
import { storeResume, MAX_RESUME_BYTES } from "../src/lib/resumeUpload.ts";
import { pdfBytes } from "./fixtures.mjs";

process.env.SUPABASE_SETUP_CONFIG = localAdminConfig();
const cfg = JSON.parse(
  fs.readFileSync(process.env.SUPABASE_SETUP_CONFIG, "utf8"),
);
requireLoopback(cfg.url, 54321);
const client = (key = cfg.publicKey) =>
  createClient(cfg.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const admin = client(cfg.secretKey);
const users = [];
const paths = [];
const sessions = [];
const report = {
  timestamp: new Date().toISOString(),
  environment: "local",
  checks: [],
};
const ok = (result) => {
  if (result.error) throw result.error;
  return result.data;
};
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
    const r = await admin
      .from(table)
      .select("id", { count: "exact", head: true });
    ok(r);
    result[table] = r.count;
  }
  return result;
}
async function user(role) {
  const email = `boundary.${randomUUID()}@example.com`;
  const password = `Boundary-${randomUUID()}!`;
  const record = ok(
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role, full_name: `Boundary ${role}` },
    }),
  ).user;
  users.push(record.id);
  const api = client();
  sessions.push(api);
  ok(await api.auth.signInWithPassword({ email, password }));
  return { id: record.id, api };
}
const before = await counts();
try {
  const recruiter = await user("recruiter");
  const candidate = await user("candidate");
  const base = {
    title: "Boundary job",
    description: "Isolated QA fixture",
    location: "Local",
  };
  for (const [field, max] of [
    ["title", 160],
    ["location", 160],
    ["description", 10000],
  ]) {
    await check(`${field}: exact maximum length is accepted`, async () => {
      const row = ok(
        await recruiter.api
          .from("jobs")
          .insert({ ...base, [field]: "x".repeat(max) })
          .select()
          .single(),
      );
      assert.equal(row[field].length, max);
    });
    await check(
      `${field}: one character over maximum is rejected`,
      async () => {
        const result = await recruiter.api
          .from("jobs")
          .insert({ ...base, [field]: "x".repeat(max + 1) });
        assert.equal(result.error?.code, "23514");
      },
    );
    await check(
      `${field}: empty and space-only values are rejected`,
      async () => {
        for (const value of ["", "   "]) {
          const result = await recruiter.api
            .from("jobs")
            .insert({ ...base, [field]: value });
          assert.equal(result.error?.code, "23514");
        }
      },
    );
  }
  for (const [name, metadata] of [
    ["unrecognised role", { role: "admin", full_name: "Boundary" }],
    ["missing role", { full_name: "Boundary" }],
    ["empty name", { role: "candidate", full_name: " " }],
    [
      "name over 120 characters",
      { role: "candidate", full_name: "x".repeat(121) },
    ],
  ]) {
    await check(`Profile creation rejects ${name}`, async () => {
      const r = await admin.auth.admin.createUser({
        email: `boundary.invalid.${randomUUID()}@example.com`,
        password: `Boundary-${randomUUID()}!`,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (r.data?.user) users.push(r.data.user.id);
      assert.ok(r.error);
      assert.equal(r.data?.user, null);
    });
  }
  await check(
    "Recruiters cannot upload a CV even in their own folder",
    async () => {
      const path = `${recruiter.id}/${randomUUID()}.pdf`;
      paths.push(path);
      const r = await recruiter.api.storage
        .from("resumes")
        .upload(path, pdfBytes("Denied recruiter upload"), {
          contentType: "application/pdf",
        });
      assert.ok(r.error);
    },
  );
  const id = randomUUID();
  paths.push(`${candidate.id}/${id}.pdf`);
  const bytes = new Uint8Array(MAX_RESUME_BYTES);
  bytes.set(pdfBytes("Exact five MB fixture"));
  let resume;
  await check(
    "Actual upload helper saves a 5 MB PDF and matching metadata",
    async () => {
      resume = await storeResume(
        candidate.api,
        candidate.id,
        id,
        "Boundary-CV.pdf",
        bytes.buffer,
      );
      assert.equal(resume.storage_path, paths.at(-1));
      assert.equal(resume.candidate_id, candidate.id);
      const blob = ok(
        await candidate.api.storage
          .from("resumes")
          .download(resume.storage_path),
      );
      assert.equal(blob.size, MAX_RESUME_BYTES);
    },
  );
  await check(
    "Client cannot replace a submitted resume by updating its metadata",
    async () => {
      const job = ok(
        await recruiter.api.from("jobs").insert(base).select().single(),
      );
      ok(
        await candidate.api
          .from("applications")
          .insert({ job_id: job.id, resume_id: id }),
      );
      const r = await candidate.api
        .from("resumes")
        .update({ original_name: "changed.pdf" })
        .eq("id", id);
      assert.ok(r.error);
      assert.equal(
        ok(
          await candidate.api
            .from("resumes")
            .select("original_name")
            .eq("id", id)
            .single(),
        ).original_name,
        "Boundary-CV.pdf",
      );
    },
  );
  await check(
    "Client cannot edit or delete submitted application content",
    async () => {
      for (const op of [
        candidate.api
          .from("applications")
          .update({ candidate_name: "Forged" })
          .eq("resume_id", id),
        candidate.api.from("applications").delete().eq("resume_id", id),
      ])
        assert.ok((await op).error);
      assert.equal(
        ok(
          await candidate.api
            .from("applications")
            .select("id")
            .eq("resume_id", id),
        ).length,
        1,
      );
    },
  );
  await check("A signed CV link is rejected after its expiry", async () => {
    const link = ok(
      await candidate.api.storage
        .from("resumes")
        .createSignedUrl(resume.storage_path, 1),
    );
    const initial = await fetch(link.signedUrl, {
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(initial.status, 200);
    await initial.arrayBuffer();
    await delay(3000);
    const expired = await fetch(link.signedUrl, {
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(expired.ok, false);
    const failure = await expired.json();
    assert.match(
      failure.message,
      /expired|"exp" claim timestamp check failed/i,
    );
  });
} finally {
  const errors = [];
  for (const api of sessions) await api.auth.signOut({ scope: "local" });
  if (paths.length) {
    const r = await admin.storage.from("resumes").remove(paths);
    if (r.error) errors.push(r.error.message);
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
    if (r.error) errors.push(r.error.message);
  }
  const after = await counts();
  report.cleanup = { before, after, errors };
  writePrivateJson("boundary-results.json", report);
  assert.deepEqual(errors, []);
  assert.deepEqual(after, before, "Pre-existing data counts must be preserved");
  console.log("PASS boundary fixture cleanup preserved existing data counts");
}
