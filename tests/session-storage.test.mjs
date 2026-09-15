// An in-memory SecureStore substitute injects corruption, write failures and races.
// Assert restored session values and cleanup outcomes without needing a physical device.
import test from "node:test";
import assert from "node:assert/strict";
import { createSessionStorage } from "../src/lib/sessionStorage.ts";
import { signOutMessage } from "../src/lib/signOut.ts";

function memory() {
  const values = new Map();
  const store = {
    async getItemAsync(key) {
      return values.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      assert.ok(Buffer.byteLength(value, "utf8") <= 1500, "native byte limit");
      values.set(key, value);
    },
    async deleteItemAsync(key) {
      values.delete(key);
    },
  };
  return { values, store, storage: createSessionStorage(store) };
}
test("Unicode sessions obey byte limits and survive adapter recreation", async () => {
  const m = memory();
  const value = JSON.stringify({ name: "漢é😀".repeat(2000), token: "sample" });
  await m.storage.setItem("session", value);
  assert.equal(await createSessionStorage(m.store).getItem("session"), value);
  for (const [key, part] of m.values)
    if (key !== "session") assert.ok(Buffer.byteLength(part) <= 1500);
});
test("existing versioned manifests remain readable", async () => {
  const m = memory();
  m.values.set(
    "session",
    JSON.stringify({ version: "1789400000000-abc", count: 2 }),
  );
  m.values.set("session.1789400000000-abc.0", "first");
  m.values.set("session.1789400000000-abc.1", "second");
  assert.equal(await m.storage.getItem("session"), "firstsecond");
});
test("malformed and unbounded manifests recover without reading arbitrary chunks", async () => {
  for (const raw of [
    "{bad",
    "null",
    '{"version":"../outside","count":1}',
    '{"version":"safe","count":10000000}',
    '{"version":"safe","count":0}',
  ]) {
    const m = memory();
    m.values.set("session", raw);
    const reads = [];
    m.store.getItemAsync = async (key) => {
      reads.push(key);
      return m.values.get(key) ?? null;
    };
    assert.equal(await m.storage.getItem("session"), null);
    assert.deepEqual(reads, ["session"]);
    assert.equal(m.values.has("session"), false);
  }
});
test("missing chunk invalidates the session and removes surviving chunks", async () => {
  const m = memory();
  await m.storage.setItem("session", "x".repeat(3000));
  const data = JSON.parse(m.values.get("session"));
  m.values.delete(`session.${data.version}.1`);
  assert.equal(await m.storage.getItem("session"), null);
  assert.equal(m.values.size, 0);
});
test("partial chunk failure preserves the previous session and cleans completed writes", async () => {
  const m = memory();
  await m.storage.setItem("session", "old");
  const original = new Map(m.values);
  const write = m.store.setItemAsync;
  m.store.setItemAsync = async (key, value) => {
    if (key.endsWith(".1")) throw new Error("simulated chunk failure");
    await new Promise((resolve) => setImmediate(resolve));
    return write(key, value);
  };
  await assert.rejects(
    m.storage.setItem("session", "y".repeat(4000)),
    /chunk failure/,
  );
  assert.deepEqual(m.values, original);
  assert.equal(await m.storage.getItem("session"), "old");
});
test("manifest commit failure preserves the old session and the queue recovers", async () => {
  const m = memory();
  await m.storage.setItem("session", "old");
  const before = new Map(m.values);
  const write = m.store.setItemAsync;
  m.store.setItemAsync = async (key, value) => {
    if (key === "session") throw new Error("manifest denied");
    return write(key, value);
  };
  await assert.rejects(m.storage.setItem("session", "next"), /manifest denied/);
  assert.deepEqual(m.values, before);
  m.store.setItemAsync = write;
  await m.storage.setItem("session", "recovered");
  assert.equal(await m.storage.getItem("session"), "recovered");
});
test("obsolete chunk cleanup failure does not invalidate a committed new session", async () => {
  const m = memory();
  await m.storage.setItem("session", "old");
  m.store.deleteItemAsync = async () => {
    throw new Error("cleanup unavailable");
  };
  await m.storage.setItem("session", "new");
  assert.equal(await m.storage.getItem("session"), "new");
});
test("concurrent update and read return the completed new session", async () => {
  const m = memory();
  await m.storage.setItem("session", "old");
  const [_, value] = await Promise.all([
    m.storage.setItem("session", "new"),
    m.storage.getItem("session"),
  ]);
  assert.equal(value, "new");
});
test("oversized session is refused before writing and keeps the old session", async () => {
  const m = memory();
  await m.storage.setItem("session", "old");
  const before = new Map(m.values);
  await assert.rejects(
    m.storage.setItem("session", "x".repeat(1500 * 129)),
    /too large/,
  );
  assert.deepEqual(m.values, before);
});
test("removal clears the manifest and referenced chunks", async () => {
  const m = memory();
  await m.storage.setItem("session", "x".repeat(4000));
  await m.storage.removeItem("session");
  assert.equal(await m.storage.getItem("session"), null);
  assert.equal(m.values.size, 0);
});
test("sign-out handles success, SDK errors and rejected storage promises", async () => {
  assert.equal(await signOutMessage(async () => ({ error: null })), "");
  assert.equal(
    await signOutMessage(async () => ({
      error: { message: "network unavailable" },
    })),
    "network unavailable",
  );
  assert.equal(
    await signOutMessage(async () => {
      throw new Error("storage unavailable");
    }),
    "storage unavailable",
  );
  assert.equal(
    await signOutMessage(async () => {
      throw null;
    }),
    "Could not sign out. Please try again.",
  );
});
