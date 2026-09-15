import test from "node:test";
import assert from "node:assert/strict";
import { loadApplicantPage } from "../src/lib/applicantPage.ts";

// Simulated service responses let us exercise failures without a Supabase server.
// Real database permissions and pagination are checked by the integration suites.
function fixture(applications, resumes = { data: [], error: null }) {
  const tables = [];
  const client = {
    from(table) {
      tables.push(table);
      assert.ok(["applications", "resumes"].includes(table));
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        async range() {
          if (applications instanceof Error) throw applications;
          return applications;
        },
        async in() {
          return resumes;
        },
      };
    },
  };
  return { client, tables };
}

test("an application API error is not reported as an empty applicant list", async () => {
  const failure = { code: "service_unavailable", message: "Please retry." };
  const { client, tables } = fixture({
    data: null,
    count: null,
    error: failure,
  });

  await assert.rejects(
    loadApplicantPage(client, "job-a"),
    (e) => e === failure,
  );
  assert.deepEqual(tables, ["applications"]);
});

test("a rejected network request reaches the caller instead of returning success", async () => {
  const failure = new Error("Network unavailable");
  const { client, tables } = fixture(failure);

  await assert.rejects(
    loadApplicantPage(client, "job-a"),
    (e) => e === failure,
  );
  assert.deepEqual(tables, ["applications"]);
});

test("a resume lookup error cannot produce a falsely successful applicant page", async () => {
  const failure = {
    code: "service_unavailable",
    message: "Resume lookup failed",
  };
  const { client } = fixture(
    {
      data: [{ id: "application-a", resume_id: "resume-a" }],
      count: 1,
      error: null,
    },
    { data: null, error: failure },
  );

  await assert.rejects(
    loadApplicantPage(client, "job-a"),
    (e) => e === failure,
  );
});

test("an unavailable count fails while a genuine zero-applicant result succeeds", async () => {
  const unavailable = fixture({ data: [], count: null, error: null });
  await assert.rejects(
    loadApplicantPage(unavailable.client, "job-a"),
    /Could not load the applicant count/,
  );

  const empty = fixture({ data: [], count: 0, error: null });
  assert.deepEqual(await loadApplicantPage(empty.client, "job-a"), {
    people: [],
    resumes: [],
    total: 0,
  });
  assert.deepEqual(empty.tables, ["applications"]);
});

test("invalid page inputs are rejected before any service request", async () => {
  const invalid = [
    [-1, 25],
    [0.5, 25],
    [NaN, 25],
    [Infinity, 25],
    ["1", 25],
    [0, 0],
    [0, -1],
    [0, 1.5],
    [0, 101],
    [0, NaN],
    [0, Infinity],
    [0, "25"],
    [Number.MAX_SAFE_INTEGER, 25],
  ];
  for (const [page, size] of invalid) {
    const { client, tables } = fixture({ data: [], count: 0, error: null });
    await assert.rejects(
      loadApplicantPage(client, "job-a", page, size),
      /Invalid applicant page/,
    );
    assert.deepEqual(tables, []);
  }
});
