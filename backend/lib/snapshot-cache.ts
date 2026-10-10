type PendingEntry<T> = {
  expiresAt: number;
  pending: Promise<T>;
};
type ValueEntry<T> = { expiresAt: number; value: T };
type Entry<T> = PendingEntry<T> | ValueEntry<T>;

const entries = new Map<string, Entry<unknown>>();
const TTL_MS = 45_000;
export const SNAPSHOT_CACHE_MAX_ENTRIES = 32;

type CacheOptions = { ttlMs?: number };

/**
 * Best-effort, bounded per-isolate LRU+TTL cache. It reduces repeated D1 reads
 * without treating process memory as durable storage; sync/reset explicitly
 * clear it. Cross-isolate consistency still comes from the persisted snapshot.
 */
export async function cachedSnapshot<T>(
  key: string,
  load: () => Promise<T>,
  options: CacheOptions = {},
): Promise<T> {
  const now = Date.now();
  pruneExpired(now);
  const existing = entries.get(key) as Entry<T> | undefined;
  if (existing && "pending" in existing) {
    touch(key, existing);
    return existing.pending;
  }
  if (existing && existing.expiresAt > now) {
    touch(key, existing);
    return existing.value;
  }
  entries.delete(key);

  const ttlMs = Math.max(1, Math.floor(options.ttlMs ?? TTL_MS));
  const pending = Promise.resolve()
    .then(load)
    .then((value) => {
      const current = entries.get(key) as Entry<T> | undefined;
      // A capacity eviction may remove an in-flight entry. In that case return
      // its value to the caller without unexpectedly evicting a newer cache key.
      if (!current || !("pending" in current) || current.pending !== pending)
        return value;
      entries.delete(key);
      makeRoom();
      entries.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .catch((error) => {
      const current = entries.get(key) as Entry<T> | undefined;
      if (current && "pending" in current && current.pending === pending)
        entries.delete(key);
      throw error;
    });
  makeRoom();
  entries.set(key, { expiresAt: now + ttlMs, pending });
  return pending;
}

export function invalidateSnapshotCache(): void {
  entries.clear();
}

/** Exposed for health metrics and bounded-cache contract tests. */
export function snapshotCacheEntryCount(): number {
  return entries.size;
}

function pruneExpired(now: number): void {
  for (const [key, entry] of entries) {
    // Pending loads are deduplicated until completion unless LRU capacity needs
    // to evict them; completed values obey their normal TTL.
    if (!("pending" in entry) && entry.expiresAt <= now) entries.delete(key);
  }
}

function touch<T>(key: string, entry: Entry<T>): void {
  entries.delete(key);
  entries.set(key, entry as Entry<unknown>);
}

function makeRoom(): void {
  while (entries.size >= SNAPSHOT_CACHE_MAX_ENTRIES) {
    const oldestKey = entries.keys().next().value as string | undefined;
    if (oldestKey === undefined) return;
    entries.delete(oldestKey);
  }
}
