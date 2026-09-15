// Integration test against a dedicated assessment project. Creates only synthetic
// fixtures. Admin is used for fixture setup/cleanup; assertions use public clients.
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { setupConfig, database } from "../scripts/db-admin.mjs";
const cfg = setupConfig();
const client = (key = cfg.publicKey) =>
  createClient(cfg.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const admin = client(cfg.secretKey);
const ids = [];
const paths = [];
const report = [];
const fixtures = {};
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      report.push({ name, result: "PASS" });
      console.log(`PASS ${name}`);
    });
}
function ok(result) {
  if (result.error) throw result.error;
  return result.data;
}
function denied(result) {
  assert.ok(result.error, "Expected denial, but operation succeeded");
}
import { pdfBytes } from "./fixtures.mjs";
const stamp = Date.now();
try {
  for (const [name, role] of [
    ["Recruiter A", "recruiter"],
    ["Recruiter B", "recruiter"],
    ["Candidate A", "candidate"],
    ["Candidate B", "candidate"],
  ]) {
    const email = `th.${name.toLowerCase().replace(" ", ".")}.${stamp}@example.com`;
    const password = `Demo-${randomUUID()}!`;
    const user = ok(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role, full_name: name },
      }),
    ).user;
    ids.push(user.id);
    const api = client();
    ok(await api.auth.signInWithPassword({ email, password }));
    fixtures[name] = { id: user.id, api, email, password };
  }
  const ra = fixtures["Recruiter A"],
    rb = fixtures["Recruiter B"],
    ca = fixtures["Candidate A"],
    cb = fixtures["Candidate B"];
  await check("Signup trigger creates immutable role profiles", async () => {
    const p = ok(await ca.api.from("profiles").select("*").single());
    assert.equal(p.role, "candidate");
    assert.equal(p.full_name, "Candidate A");
  });
  await check("Candidate cannot change their role", async () =>
    denied(
      await ca.api
        .from("profiles")
        .update({ role: "recruiter" })
        .eq("id", ca.id),
    ),
  );
  await check("Candidate cannot read another profile", async () =>
    assert.equal(
      ok(await ca.api.from("profiles").select("*").eq("id", cb.id)).length,
      0,
    ),
  );
  let ja, jb;
  await check("Recruiters can post their own jobs", async () => {
    ja = ok(
      await ra.api
        .from("jobs")
        .insert({
          title: "Frontend developer - Demo A",
          location: "Dublin / Hybrid",
          description:
            "Build accessible React experiences with a small product team.",
        })
        .select()
        .single(),
    );
    jb = ok(
      await rb.api
        .from("jobs")
        .insert({
          title: "QA engineer - Demo B",
          location: "Remote",
          description:
            "Test candidate and recruiter flows and document clear reproduction steps.",
        })
        .select()
        .single(),
    );
    assert.equal(ja.recruiter_id, ra.id);
  });
  await check("Candidate cannot post a job", async () =>
    denied(
      await ca.api
        .from("jobs")
        .insert({ title: "forbidden", location: "x", description: "x" }),
    ),
  );
  await check("Recruiter cannot forge a job owner", async () =>
    denied(
      await ra.api.from("jobs").insert({
        recruiter_id: rb.id,
        title: "forbidden",
        location: "x",
        description: "x",
      }),
    ),
  );
  await check("Candidates can browse posted jobs", async () =>
    assert.ok(
      ok(await ca.api.from("jobs").select("*")).some((j) => j.id === ja.id),
    ),
  );
  let resumeA, resumeB;
  for (const candidate of [ca, cb]) {
    const id = randomUUID(),
      path = `${candidate.id}/${id}.pdf`;
    paths.push(path);
    await check(
      `Candidate ${candidate === ca ? "A" : "B"} can upload a private PDF`,
      async () =>
        ok(
          await candidate.api.storage
            .from("resumes")
            .upload(
              path,
              pdfBytes(candidate === ca ? "Candidate A" : "Candidate B"),
              { contentType: "application/pdf" },
            ),
        ),
    );
    const resume = ok(
      await candidate.api
        .from("resumes")
        .insert({ id, storage_path: path, original_name: "Synthetic-CV.pdf" })
        .select()
        .single(),
    );
    if (candidate === ca) resumeA = resume;
    else resumeB = resume;
  }
  await check("Recruiter cannot read an unsubmitted candidate CV", async () =>
    denied(await ra.api.storage.from("resumes").download(resumeA.storage_path)),
  );
  await check("A candidate cannot read another candidate CV", async () =>
    denied(await cb.api.storage.from("resumes").download(resumeA.storage_path)),
  );
  await check("Resume paths cannot claim another candidate folder", async () =>
    denied(
      await cb.api.storage
        .from("resumes")
        .upload(`${ca.id}/${randomUUID()}.pdf`, pdfBytes("Forbidden"), {
          contentType: "application/pdf",
        }),
    ),
  );
  await check(
    "Upload with a disallowed MIME type is rejected by Storage",
    async () =>
      denied(
        await ca.api.storage
          .from("resumes")
          .upload(`${ca.id}/${randomUUID()}.pdf`, "not a pdf", {
            contentType: "text/plain",
          }),
      ),
  );
  await check("Oversized upload is rejected by Storage", async () =>
    denied(
      await ca.api.storage
        .from("resumes")
        .upload(`${ca.id}/${randomUUID()}.pdf`, Buffer.alloc(5242881), {
          contentType: "application/pdf",
        }),
    ),
  );
  await check(
    "Candidate cannot apply with another candidate resume",
    async () =>
      denied(
        await cb.api
          .from("applications")
          .insert({ job_id: ja.id, resume_id: resumeA.id }),
      ),
  );
  await check("Candidate cannot apply with a missing resume", async () =>
    denied(
      await ca.api
        .from("applications")
        .insert({ job_id: ja.id, resume_id: randomUUID() }),
    ),
  );
  await check("Recruiter cannot submit a candidate application", async () =>
    denied(
      await ra.api
        .from("applications")
        .insert({ job_id: ja.id, resume_id: resumeA.id }),
    ),
  );
  let application;
  await check(
    "Candidate applies; database fills candidate identity",
    async () => {
      application = ok(
        await ca.api
          .from("applications")
          .insert({ job_id: ja.id, resume_id: resumeA.id })
          .select()
          .single(),
      );
      assert.equal(application.candidate_name, "Candidate A");
      assert.equal(application.candidate_id, ca.id);
    },
  );
  await check(
    "Duplicate application is rejected by unique constraint",
    async () => {
      const r = await ca.api
        .from("applications")
        .insert({ job_id: ja.id, resume_id: resumeA.id });
      assert.equal(r.error?.code, "23505");
    },
  );
  await check("Candidate cannot forge candidate name or owner", async () =>
    denied(
      await ca.api.from("applications").insert({
        job_id: jb.id,
        resume_id: resumeA.id,
        candidate_name: "Fake",
        candidate_id: cb.id,
      }),
    ),
  );
  await check("Owning recruiter can read their applicant", async () =>
    assert.equal(
      ok(await ra.api.from("applications").select("*").eq("id", application.id))
        .length,
      1,
    ),
  );
  await check(
    "Other recruiter cannot read applicant even by exact ID",
    async () =>
      assert.equal(
        ok(
          await rb.api
            .from("applications")
            .select("*")
            .eq("id", application.id),
        ).length,
        0,
      ),
  );
  await check("Other candidate cannot read the application", async () =>
    assert.equal(
      ok(await cb.api.from("applications").select("*").eq("id", application.id))
        .length,
      0,
    ),
  );
  await check("Other recruiter cannot read resume metadata", async () =>
    assert.equal(
      ok(await rb.api.from("resumes").select("*").eq("id", resumeA.id)).length,
      0,
    ),
  );
  await check("Other recruiter cannot download resume bytes", async () =>
    denied(await rb.api.storage.from("resumes").download(resumeA.storage_path)),
  );
  await check("Other recruiter cannot mint a signed resume URL", async () =>
    denied(
      await rb.api.storage
        .from("resumes")
        .createSignedUrl(resumeA.storage_path, 60),
    ),
  );
  await check("Owning recruiter can download the submitted PDF", async () => {
    const blob = ok(
      await ra.api.storage.from("resumes").download(resumeA.storage_path),
    );
    assert.equal(
      Buffer.from(await blob.arrayBuffer())
        .subarray(0, 5)
        .toString(),
      "%PDF-",
    );
  });
  await check("Owning recruiter signed URL returns the PDF", async () => {
    const link = ok(
      await ra.api.storage
        .from("resumes")
        .createSignedUrl(resumeA.storage_path, 60),
    );
    const response = await fetch(link.signedUrl);
    assert.equal(response.status, 200);
    assert.ok((await response.text()).startsWith("%PDF-"));
  });
  await check("Resume bytes cannot be overwritten", async () =>
    denied(
      await ca.api.storage
        .from("resumes")
        .update(resumeA.storage_path, pdfBytes("Changed"), {
          contentType: "application/pdf",
        }),
    ),
  );
  await check("Client cannot delete a submitted application", async () =>
    denied(await ca.api.from("applications").delete().eq("id", application.id)),
  );
  await check("Client cannot change an existing job owner", async () =>
    denied(
      await ra.api.from("jobs").update({ recruiter_id: rb.id }).eq("id", ja.id),
    ),
  );
  await check("Anonymous client cannot read private tables", async () => {
    for (const table of ["profiles", "resumes", "applications"])
      denied(await client().from(table).select("*"));
  });
  await check("Public Storage URL does not expose a private PDF", async () => {
    const { data } = client()
      .storage.from("resumes")
      .getPublicUrl(resumeA.storage_path);
    assert.notEqual((await fetch(data.publicUrl)).status, 200);
  });
  await check(
    "Metadata without uploaded bytes cannot be submitted",
    async () => {
      const id = randomUUID();
      ok(
        await cb.api.from("resumes").insert({
          id,
          storage_path: `${cb.id}/${id}.pdf`,
          original_name: "missing.pdf",
        }),
      );
      try {
        denied(
          await cb.api
            .from("applications")
            .insert({ job_id: jb.id, resume_id: id }),
        );
      } finally {
        ok(await admin.from("resumes").delete().eq("id", id));
      }
    },
  );
  // Keep a second recruiter's legitimate application for a useful demo comparison.
  ok(
    await cb.api
      .from("applications")
      .insert({ job_id: jb.id, resume_id: resumeB.id }),
  );
  const output = process.env.SUPABASE_TEST_REPORT;
  if (output)
    fs.writeFileSync(
      output,
      JSON.stringify(
        { timestamp: new Date().toISOString(), checks: report },
        null,
        2,
      ),
    );
  if (process.env.KEEP_DEMO_FIXTURES === "1") {
    const path = process.env.SUPABASE_DEMO_ACCOUNTS;
    if (!path)
      throw new Error(
        "A private demo-account output path is required when preserving fixtures.",
      );
    fs.writeFileSync(
      path,
      JSON.stringify(
        Object.fromEntries(
          Object.entries(fixtures).map(([k, v]) => [
            k,
            { id: v.id, email: v.email, password: v.password },
          ]),
        ),
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(
      "Synthetic demo fixtures retained; account details written to the private output path.",
    );
  }
} finally {
  if (process.env.KEEP_DEMO_FIXTURES !== "1") {
    if (paths.length) await admin.storage.from("resumes").remove(paths);
    const db = await database();
    try {
      await db.query(
        "delete from public.applications where candidate_id=any($1::uuid[])",
        [ids],
      );
      await db.query(
        "delete from public.resumes where candidate_id=any($1::uuid[])",
        [ids],
      );
      await db.query(
        "delete from public.jobs where recruiter_id=any($1::uuid[])",
        [ids],
      );
    } finally {
      await db.end();
    }
    for (const id of ids) await admin.auth.admin.deleteUser(id);
  }
}
