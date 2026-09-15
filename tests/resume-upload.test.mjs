// Unit tests exercise the real upload helper with controlled Storage/database responses.
// Arrange file bytes and failures, run the upload, then assert writes and user-facing errors.
import test from "node:test";
import assert from "node:assert/strict";
import { MAX_RESUME_BYTES, storeResume } from "../src/lib/resumeUpload.ts";

function pdf(size = 32) {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode("%PDF-"));
  return bytes.buffer;
}
function fixture({ uploadError, uploadReject, metadataError } = {}) {
  const uploads = [];
  const rows = [];
  const record = { id: "resume-a", original_name: "CV.pdf" };
  const client = {
    storage: {
      from() {
        return {
          async upload(...args) {
            uploads.push(args);
            if (uploadReject) throw uploadReject;
            return { error: uploadError || null };
          },
        };
      },
    },
    from() {
      return {
        insert(row) {
          rows.push(row);
          return this;
        },
        select() {
          return this;
        },
        async single() {
          return {
            data: metadataError ? null : record,
            error: metadataError || null,
          };
        },
      };
    },
  };
  return { client, uploads, rows, record };
}
const save = (f, bytes) =>
  storeResume(f.client, "candidate-a", "resume-a", "CV.pdf", bytes);

test("empty files are rejected before any upload", async () => {
  const f = fixture();
  await assert.rejects(save(f, new ArrayBuffer(0)), /between 1 byte and 5 MB/);
  assert.deepEqual(f.uploads, []);
  assert.deepEqual(f.rows, []);
});
test("the exact 5 MB boundary is accepted without overwriting a file", async () => {
  const f = fixture();
  assert.equal(await save(f, pdf(MAX_RESUME_BYTES)), f.record);
  assert.equal(f.uploads[0][0], "candidate-a/resume-a.pdf");
  assert.equal(f.uploads[0][1].byteLength, MAX_RESUME_BYTES);
  assert.deepEqual(f.uploads[0][2], {
    contentType: "application/pdf",
    upsert: false,
  });
});
test("one byte over the limit is rejected before contacting Storage", async () => {
  const f = fixture();
  await assert.rejects(
    save(f, pdf(MAX_RESUME_BYTES + 1)),
    /between 1 byte and 5 MB/,
  );
  assert.deepEqual(f.uploads, []);
});
test("a PDF filename cannot make non-PDF bytes pass the client check", async () => {
  const f = fixture();
  await assert.rejects(
    save(f, new TextEncoder().encode("harmless plain text").buffer),
    /does not appear to be a PDF/,
  );
  assert.deepEqual(f.uploads, []);
});
test("a Storage rejection cannot create successful resume metadata", async () => {
  const failure = { message: "Permission denied" };
  const f = fixture({ uploadError: failure });
  await assert.rejects(save(f, pdf()), (e) => e === failure);
  assert.deepEqual(f.rows, []);
});
test("a disconnected upload cannot create successful resume metadata", async () => {
  const failure = new Error("Connection lost");
  const f = fixture({ uploadReject: failure });
  await assert.rejects(save(f, pdf()), (e) => e === failure);
  assert.deepEqual(f.rows, []);
});
test("metadata failure after upload reports a partial failure", async () => {
  const f = fixture({ metadataError: { message: "Database unavailable" } });
  await assert.rejects(save(f, pdf()), /file uploaded but could not be saved/);
  assert.equal(f.uploads.length, 1);
  assert.equal(f.rows.length, 1);
});
test("metadata uses the same private path and bounds the display filename", async () => {
  const f = fixture();
  await storeResume(
    f.client,
    "candidate-a",
    "resume-a",
    "x".repeat(300),
    pdf(),
  );
  assert.deepEqual(f.rows, [
    {
      id: "resume-a",
      storage_path: "candidate-a/resume-a.pdf",
      original_name: "x".repeat(255),
    },
  ]);
});
