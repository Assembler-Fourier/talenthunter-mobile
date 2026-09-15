// Adapt native SecureStore to the getItem/setItem/removeItem interface Supabase expects.
// A small manifest points to versioned chunks so a partly written session is never committed.
type Store = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};
type Manifest = { version: string; count: number };
const CHUNK_BYTES = 1500;
const MAX_CHUNKS = 128;

function manifest(raw: string | null): Manifest | null {
  // Treat malformed or unbounded metadata as a missing session, not arbitrary storage keys.
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Manifest;
    if (
      typeof value.version !== "string" ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(value.version) ||
      !Number.isInteger(value.count) ||
      value.count < 1 ||
      value.count > MAX_CHUNKS
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

function chunksFor(value: string) {
  const chunks: string[] = [];
  let current = "";
  let bytes = 0;
  // Iterate code points so a surrogate pair is never cut between chunks.
  for (const character of value) {
    const point = character.codePointAt(0)!;
    const size =
      point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes + size > CHUNK_BYTES) {
      chunks.push(current);
      current = "";
      bytes = 0;
    }
    current += character;
    bytes += size;
  }
  chunks.push(current);
  if (chunks.length > MAX_CHUNKS)
    throw new Error("Session data is too large to store securely.");
  return chunks;
}

export function createSessionStorage(store: Store) {
  // Serialise reads, writes and removal so token refresh cannot race with logout.
  let queue: Promise<void> = Promise.resolve();
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation, operation);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  async function removeChunks(key: string, data: Manifest) {
    await Promise.allSettled(
      Array.from({ length: data.count }, (_, i) =>
        store.deleteItemAsync(`${key}.${data.version}.${i}`),
      ),
    );
  }
  return {
    getItem(key: string) {
      // Recover only complete sessions; missing chunks force a clean sign-in.
      return serial(async () => {
        const raw = await store.getItemAsync(key);
        const data = manifest(raw);
        if (!data) {
          if (raw !== null) await store.deleteItemAsync(key);
          return null;
        }
        const chunks = await Promise.all(
          Array.from({ length: data.count }, (_, i) =>
            store.getItemAsync(`${key}.${data.version}.${i}`),
          ),
        );
        if (chunks.some((chunk) => chunk === null)) {
          await store.deleteItemAsync(key);
          await removeChunks(key, data);
          return null;
        }
        return chunks.join("");
      });
    },
    setItem(key: string, value: string) {
      // Write a new generation first, then commit its manifest before deleting the old chunks.
      return serial(async () => {
        const previous = manifest(await store.getItemAsync(key));
        const chunks = chunksFor(value);
        const next = {
          version: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          count: chunks.length,
        };
        // Wait for every write to settle before attempting failed-write cleanup.
        const writes = await Promise.allSettled(
          chunks.map((chunk, i) =>
            store.setItemAsync(`${key}.${next.version}.${i}`, chunk),
          ),
        );
        const failed = writes.find((result) => result.status === "rejected");
        if (failed?.status === "rejected") {
          await removeChunks(key, next);
          throw failed.reason;
        }
        try {
          await store.setItemAsync(key, JSON.stringify(next));
        } catch (error) {
          await removeChunks(key, next);
          throw error;
        }
        // Cleanup failure cannot invalidate the newly committed manifest.
        if (previous) await removeChunks(key, previous);
      });
    },
    removeItem(key: string) {
      // Remove the manifest first so the session becomes unreadable even if chunk cleanup fails.
      return serial(async () => {
        const data = manifest(await store.getItemAsync(key));
        await store.deleteItemAsync(key);
        if (data) await removeChunks(key, data);
      });
    },
  };
}
