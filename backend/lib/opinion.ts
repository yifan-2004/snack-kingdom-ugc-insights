export type OpinionKind =
  | "opinion"
  | "mixed_opinion"
  | "inquiry"
  | "factual"
  | "social"
  | "off_topic";

const kinds = new Set<OpinionKind>([
  "opinion",
  "mixed_opinion",
  "inquiry",
  "factual",
  "social",
  "off_topic",
]);

export function normalizeOpinionKind(
  value: unknown,
  fallback: OpinionKind = "opinion",
): OpinionKind {
  const normalized = String(value ?? "").trim().toLowerCase() as OpinionKind;
  return kinds.has(normalized) ? normalized : fallback;
}

export function isOpinionBearing(kind: OpinionKind) {
  return kind === "opinion";
}

export function isMixedOpinion(kind: OpinionKind) {
  return kind === "mixed_opinion";
}
