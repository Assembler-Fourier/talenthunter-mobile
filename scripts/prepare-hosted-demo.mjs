// Explicit, private assessment fixture preparation. Never targets talenthunter.me.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { database, setupConfig } from "./db-admin.mjs";
import { hostedConfig } from "./backend-env.mjs";
import { loadApplicantPage } from "../src/lib/applicantPage.ts";

if (!process.argv.includes("--replace-legacy-assessment-fixtures")) {
  throw new Error(
    "This replaces recorded legacy assessment fixtures. Review the private CV directory and legacy account manifest before selecting --replace-legacy-assessment-fixtures.",
  );
}
const cfg = setupConfig();
assert.equal(
  cfg.url,
  "https://wwwesmdgxpsckalxacxy.supabase.co",
  "This script is pinned to Uzair's assessment project.",
);
assert.equal(hostedConfig().url, cfg.url);
const cvDirectory = process.env.TALENTHUNTER_DEMO_CVS;
const legacyFile = process.env.TALENTHUNTER_LEGACY_ACCOUNTS;
if (!cvDirectory || !legacyFile)
  throw new Error(
    "Set the private CV directory and legacy account file paths.",
  );
const directory = path.resolve(".local/hosted-demo");
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
const catalogText = fs.readFileSync("scripts/demo-catalog.json", "utf8");
const catalog = JSON.parse(catalogText);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const statePath = path.join(directory, "accounts.json");
const beforePath = path.join(directory, "before-data.json");
const privateWrite = (file, value) => {
  fs.writeFileSync(file + ".tmp", JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
  fs.renameSync(file + ".tmp", file);
};
let state = fs.existsSync(statePath)
  ? JSON.parse(fs.readFileSync(statePath, "utf8"))
  : {
      project: cfg.url,
      catalogHash: digest(catalogText),
      users: {},
      jobs: {},
      resumes: {},
      applications: {},
      complete: false,
    };
assert.equal(
  state.catalogHash,
  digest(catalogText),
  "Catalogue changed; review before updating an existing demo.",
);
const save = () => privateWrite(statePath, state);
const makeClient = (key) =>
  createClient(cfg.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const admin = makeClient(cfg.secretKey);
const ok = (result) => {
  if (result.error) throw result.error;
  return result.data;
};
const clients = {};
const db = await database();
const report = {
  timestamp: new Date().toISOString(),
  environment: "hosted assessment",
  checks: [],
  expectedCounts: { profiles: 7, jobs: 3, resumes: 5, applications: 10 },
};
async function check(name, run) {
  await run();
  report.checks.push({ name, result: "PASS" });
  console.log("PASS " + name);
}

try {
  const legacy = JSON.parse(fs.readFileSync(legacyFile, "utf8"));
  if (!fs.existsSync(beforePath)) {
    const snapshot = {};
    for (const table of ["profiles", "jobs", "resumes", "applications"])
      snapshot[table] = (await db.query("select * from public." + table)).rows;
    privateWrite(beforePath, snapshot);
  }
  const before = JSON.parse(fs.readFileSync(beforePath, "utf8"));
  const legacyIds = Object.values(legacy).map((user) => user.id);
  assert.equal(
    before.profiles.length,
    4,
    "Only the four recorded legacy fixture profiles may be replaced.",
  );
  assert.ok(before.profiles.every((user) => legacyIds.includes(user.id)));
  const oldTitles = [
    "Frontend developer - Demo A",
    "QA engineer - Demo B",
    "Mobile developer - UI demo",
    "Native demo job",
  ];
  assert.equal(before.jobs.length, 4);
  assert.ok(
    before.jobs.every(
      (job) =>
        oldTitles.includes(job.title) && legacyIds.includes(job.recruiter_id),
    ),
  );
  if (!fs.existsSync(path.join(directory, "legacy-accounts-backup.json")))
    privateWrite(path.join(directory, "legacy-accounts-backup.json"), legacy);

  if (!state.complete) {
    // Back up old bytes before replacing only the previously recorded synthetic data.
    fs.mkdirSync(path.join(directory, "legacy-cvs"), {
      recursive: true,
      mode: 0o700,
    });
    for (const resume of before.resumes) {
      assert.ok(legacyIds.includes(resume.candidate_id));
      const target = path.join(directory, "legacy-cvs", resume.id + ".pdf");
      if (!fs.existsSync(target)) {
        const file = ok(
          await admin.storage.from("resumes").download(resume.storage_path),
        );
        fs.writeFileSync(target, Buffer.from(await file.arrayBuffer()), {
          mode: 0o600,
        });
      }
    }
    const people = [
      ...catalog.recruiters.map((person) => ({ ...person, role: "recruiter" })),
      ...catalog.candidates.map((person) => ({ ...person, role: "candidate" })),
    ];
    for (const person of people) {
      if (!state.users[person.key]) {
        state.users[person.key] = {
          name: person.name,
          email: person.email,
          role: person.role,
          password: person.legacy
            ? legacy[person.legacy].password
            : randomBytes(18).toString("base64url"),
          id: person.legacy ? legacy[person.legacy].id : null,
        };
        save();
      }
      const user = state.users[person.key];
      if (!user.prepared) {
        if (user.id) {
          const previous = ok(await admin.auth.admin.getUserById(user.id)).user;
          const backup = path.join(
            directory,
            "auth-before-" + user.id + ".json",
          );
          if (!fs.existsSync(backup))
            privateWrite(backup, {
              id: previous.id,
              email: previous.email,
              user_metadata: previous.user_metadata,
            });
          ok(
            await admin.auth.admin.updateUserById(user.id, {
              email: user.email,
              email_confirm: true,
              user_metadata: { role: user.role, full_name: user.name },
            }),
          );
          const updated = await db.query(
            "update public.profiles set full_name=$2 where id=$1 and role=$3 returning id",
            [user.id, user.name, user.role],
          );
          assert.equal(updated.rowCount, 1);
        } else {
          const created = ok(
            await admin.auth.admin.createUser({
              email: user.email,
              password: user.password,
              email_confirm: true,
              user_metadata: { role: user.role, full_name: user.name },
            }),
          );
          user.id = created.user.id;
          save();
        }
        user.prepared = true;
        save();
      }
      const client = makeClient(cfg.publicKey);
      ok(
        await client.auth.signInWithPassword({
          email: user.email,
          password: user.password,
        }),
      );
      clients[person.key] = client;
    }
    for (const job of catalog.jobs) {
      if (!state.jobs[job.key]) {
        const saved = ok(
          await clients[job.recruiter]
            .from("jobs")
            .insert({
              title: job.title,
              location: job.location,
              description: job.description,
            })
            .select()
            .single(),
        );
        state.jobs[job.key] = {
          ...saved,
          key: job.key,
          recruiter: job.recruiter,
          source: job.source,
        };
        save();
      }
    }
    for (const person of catalog.candidates) {
      const user = state.users[person.key];
      const client = clients[person.key];
      const bytes = fs.readFileSync(path.join(cvDirectory, person.cv));
      assert.ok(
        bytes.subarray(0, 5).toString() === "%PDF-" && bytes.length < 5242880,
      );
      if (!state.resumes[person.key]) {
        const id = randomUUID();
        state.resumes[person.key] = {
          id,
          storage_path: `${user.id}/${id}.pdf`,
          original_name: person.cv,
          sha256: digest(bytes),
          uploaded: false,
          saved: false,
        };
        save();
      }
      const resume = state.resumes[person.key];
      assert.equal(resume.sha256, digest(bytes));
      if (!resume.uploaded) {
        const existing = await client.storage
          .from("resumes")
          .download(resume.storage_path);
        if (!existing.error)
          assert.equal(
            digest(Buffer.from(await existing.data.arrayBuffer())),
            resume.sha256,
          );
        else
          ok(
            await client.storage
              .from("resumes")
              .upload(resume.storage_path, bytes, {
                contentType: "application/pdf",
                upsert: false,
              }),
          );
        resume.uploaded = true;
        save();
      }
      if (!resume.saved) {
        const existing = ok(
          await client
            .from("resumes")
            .select("id")
            .eq("id", resume.id)
            .maybeSingle(),
        );
        if (!existing)
          ok(
            await client.from("resumes").insert({
              id: resume.id,
              storage_path: resume.storage_path,
              original_name: resume.original_name,
            }),
          );
        resume.saved = true;
        save();
      }
      for (const jobKey of person.appliesTo) {
        const key = person.key + ":" + jobKey;
        if (!state.applications[key]) {
          const result = await client
            .from("applications")
            .insert({ job_id: state.jobs[jobKey].id, resume_id: resume.id });
          if (result.error && result.error.code !== "23505") throw result.error;
          const saved = ok(
            await client
              .from("applications")
              .select()
              .eq("job_id", state.jobs[jobKey].id)
              .single(),
          );
          assert.equal(saved.resume_id, resume.id);
          state.applications[key] = saved;
          save();
        }
      }
    }
    // All new fixtures exist; remove the exact backed-up legacy rows transactionally.
    await db.query("begin");
    try {
      for (const table of ["applications", "jobs", "resumes"])
        await db.query(
          "delete from public." + table + " where id=any($1::uuid[])",
          [before[table].map((row) => row.id)],
        );
      await db.query("commit");
    } catch (error) {
      await db.query("rollback");
      throw error;
    }
    ok(
      await admin.storage
        .from("resumes")
        .remove(before.resumes.map((row) => row.storage_path)),
    );
    state.complete = true;
    state.completedAt = new Date().toISOString();
    save();
  }
  for (const [key, user] of Object.entries(state.users)) {
    if (!clients[key]) {
      const client = makeClient(cfg.publicKey);
      ok(
        await client.auth.signInWithPassword({
          email: user.email,
          password: user.password,
        }),
      );
      clients[key] = client;
    }
    await check(
      `${user.name}: public-client sign-in and isolated profile`,
      async () => {
        const rows = ok(
          await clients[key].from("profiles").select("id,role,full_name"),
        );
        assert.equal(rows.length, 1);
        assert.equal(rows[0].id, user.id);
        assert.equal(rows[0].full_name, user.name);
        assert.equal(rows[0].role, user.role);
      },
    );
  }
  for (const person of catalog.candidates) {
    const client = clients[person.key];
    await check(
      `${person.name}: three jobs and exactly two intended applications`,
      async () => {
        assert.equal(ok(await client.from("jobs").select("id")).length, 3);
        const apps = ok(
          await client
            .from("applications")
            .select("job_id,candidate_name,resume_id"),
        );
        assert.equal(apps.length, 2);
        assert.deepEqual(
          apps.map((a) => a.job_id).sort(),
          person.appliesTo.map((key) => state.jobs[key].id).sort(),
        );
        assert.ok(
          apps.every(
            (a) =>
              a.candidate_name === person.name &&
              a.resume_id === state.resumes[person.key].id,
          ),
        );
      },
    );
    await check(`${person.name}: correct private PDF bytes`, async () => {
      const file = ok(
        await client.storage
          .from("resumes")
          .download(state.resumes[person.key].storage_path),
      );
      assert.equal(
        digest(Buffer.from(await file.arrayBuffer())),
        state.resumes[person.key].sha256,
      );
    });
  }
  for (const job of catalog.jobs) {
    const own = clients[job.recruiter];
    const other =
      clients[job.recruiter === "talenthunter" ? "ibat" : "talenthunter"];
    await check(
      `${job.title}: exact total ${job.expectedApplicants}, paginated rows and matching CVs`,
      async () => {
        const ids = [];
        for (
          let page = 0;
          page < Math.ceil(job.expectedApplicants / 2);
          page++
        ) {
          const result = await loadApplicantPage(
            own,
            state.jobs[job.key].id,
            page,
            2,
          );
          assert.equal(result.total, job.expectedApplicants);
          for (const person of result.people) {
            ids.push(person.id);
            const resume = result.resumes.find(
              (r) => r.id === person.resume_id,
            );
            assert.ok(resume);
            const blob = ok(
              await own.storage.from("resumes").download(resume.storage_path),
            );
            assert.ok(
              Buffer.from(await blob.arrayBuffer())
                .subarray(0, 5)
                .toString() === "%PDF-",
            );
          }
        }
        assert.equal(ids.length, job.expectedApplicants);
        assert.equal(new Set(ids).size, job.expectedApplicants);
      },
    );
    await check(
      `${job.title}: other recruiter cannot read applicants or their count`,
      async () => {
        const result = await loadApplicantPage(
          other,
          state.jobs[job.key].id,
          0,
          2,
        );
        assert.equal(result.total, 0);
        assert.deepEqual(result.people, []);
        assert.deepEqual(result.resumes, []);
      },
    );
  }
  await check(
    "IBAT cannot read a CV never submitted to its HR job",
    async () => {
      assert.ok(
        (
          await clients.ibat.storage
            .from("resumes")
            .download(state.resumes.aisha.storage_path)
        ).error,
      );
      assert.ok(
        (
          await clients.ibat.storage
            .from("resumes")
            .createSignedUrl(state.resumes.aisha.storage_path, 60)
        ).error,
      );
    },
  );
  await check(
    "Candidate cannot read another candidate's private CV",
    async () => {
      assert.ok(
        (
          await clients.aisha.storage
            .from("resumes")
            .download(state.resumes.maya.storage_path)
        ).error,
      );
    },
  );
  await check(
    "Authorised signed link opens the expected CV bytes",
    async () => {
      const link = ok(
        await clients.ibat.storage
          .from("resumes")
          .createSignedUrl(state.resumes.sofia.storage_path, 60),
      );
      const response = await fetch(link.signedUrl);
      assert.equal(response.status, 200);
      assert.equal(
        digest(Buffer.from(await response.arrayBuffer())),
        state.resumes.sofia.sha256,
      );
    },
  );
  await check(
    "Final hosted dataset contains only seven profiles, three jobs, five CVs and ten applications",
    async () => {
      const counts = {};
      for (const table of ["profiles", "jobs", "resumes", "applications"])
        counts[table] = Number(
          (await db.query("select count(*) from public." + table)).rows[0]
            .count,
        );
      assert.deepEqual(counts, report.expectedCounts);
      report.actualCounts = counts;
    },
  );
  report.completed = true;
} finally {
  await db.end();
  await Promise.allSettled(
    Object.values(clients).map((client) =>
      client.auth.signOut({ scope: "local" }),
    ),
  );
  privateWrite(path.join(directory, "verification.json"), report);
}
console.log(
  `Hosted assessment demo ready: ${report.checks.length} checks passed. Private account details: .local/hosted-demo/accounts.json`,
);
