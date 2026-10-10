const DEFAULT_MAX_BODY_BYTES = 32 * 1024;
export const RATE_LIMIT_MAX_BUCKETS = 1_024;
const RATE_LIMIT_SWEEP_INTERVAL_MS = 10_000;

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();
let nextRateBucketSweepAt = 0;

export class PublicRequestError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export async function readJsonObject<T extends Record<string, unknown>>(
  request: Request,
  maxBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<T> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new PublicRequestError("请求内容过大", 413);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new PublicRequestError("请求必须使用 JSON 格式");
  }

  const raw = await readBoundedText(request, maxBytes);

  try {
    const parsed: unknown = JSON.parse(raw || "{}");
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new PublicRequestError("请求格式不正确");
    }
    return parsed as T;
  } catch (error) {
    if (error instanceof PublicRequestError) throw error;
    throw new PublicRequestError("请求 JSON 无法解析");
  }
}

export async function readBoundedText(request: Request, maxBytes: number): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new PublicRequestError("请求内容过大", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    if (error instanceof PublicRequestError) throw error;
    throw new PublicRequestError("请求正文不是有效的UTF-8文本");
  } finally { reader.releaseLock(); }
}

export function postIdsFrom(value: unknown, limit = 200): number[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter(
    (item): item is number =>
      typeof item === "number" && Number.isSafeInteger(item) && item > 0,
  );
  return [...new Set(ids)].slice(0, limit);
}

/**
 * Best-effort edge-isolate throttle for endpoints that scan the RAG snapshot.
 *
 * This deliberately has a hard memory bound and TTL/LRU cleanup, but it is not
 * a distributed security boundary: production deployments still need a durable
 * Cloudflare rate-limiting rule or equivalent shared quota.
 */
export function enforceRateLimit(
  request: Request,
  scope: string,
  maxRequests: number,
  windowMs = 60_000,
): void {
  const now = Date.now();
  pruneRateBuckets(now);
  const client =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous";
  const key = `${scope}:${client.slice(0, 128)}`;
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.delete(key);
    makeRateBucketRoom();
    rateBuckets.set(key, {
      count: 1,
      resetAt: now + Math.max(1, Math.floor(windowMs)),
    });
    return;
  }

  // Reinsert the active bucket so Map insertion order is also LRU order.
  rateBuckets.delete(key);
  rateBuckets.set(key, bucket);
  if (bucket.count >= Math.max(1, Math.floor(maxRequests)))
    throw new PublicRequestError("操作过于频繁，请稍后再试", 429);
  bucket.count += 1;
}

function pruneRateBuckets(now: number): void {
  if (now < nextRateBucketSweepAt && rateBuckets.size < RATE_LIMIT_MAX_BUCKETS)
    return;
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
  nextRateBucketSweepAt = now + RATE_LIMIT_SWEEP_INTERVAL_MS;
}

function makeRateBucketRoom(): void {
  while (rateBuckets.size >= RATE_LIMIT_MAX_BUCKETS) {
    const oldestKey = rateBuckets.keys().next().value as string | undefined;
    if (oldestKey === undefined) return;
    rateBuckets.delete(oldestKey);
  }
}

/** Exposed for health metrics and bounded-cache contract tests. */
export function rateLimitBucketCount(): number {
  return rateBuckets.size;
}

export function errorResponse(error: unknown, fallback: string): Response {
  if (error instanceof PublicRequestError) {
    return Response.json(
      { error: error.message },
      {
        status: error.status,
        headers:
          error.status === 503
            ? { "Cache-Control": "no-store", "Retry-After": "3" }
            : undefined,
      },
    );
  }
  console.error(fallback, error);
  return Response.json({ error: fallback }, { status: 500 });
}
