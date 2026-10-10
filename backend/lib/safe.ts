export function safeHttpUrl(value: unknown): string | undefined {
  const candidate = String(value ?? "")
    .trim()
    .slice(0, 2048);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    // The public workbench never needs clear-text third-party media or links.
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
