import { mirrorCache, mirrorResponse, readMirror } from "../../../../lib/local-mirror";

type Evidence = {
  id: string; post_id: string; kind: string; date: string | null;
  sentiment: string | null; is_question?: boolean; [key: string]: unknown;
};
type ChartData = {
  scatter: unknown[]; timeline: unknown[]; missing_dates: number;
  new_posts_pending: number; new_comments_pending: number;
  collected_posts: number; collected_comments: number; updated_at: string;
};
type Mirror = {
  global: Record<string, ChartData>;
  topics: Record<string, { items: Evidence[]; charts: Record<string, ChartData> }>;
};

function sentimentClass(row: Evidence) {
  if (row.kind !== "comment") return "all";
  return ["positive", "negative", "neutral", "mixed"].includes(String(row.sentiment))
    ? String(row.sentiment) : "non_opinion";
}

export async function GET(request: Request) {
  try {
    const data = await readMirror<Mirror>("explorer.json");
    const query = new URL(request.url).searchParams;
    const topic = query.get("topic") ?? "";
    const period = ["day", "week", "month"].includes(query.get("period") ?? "") ? query.get("period")! : "week";
    const kind = query.get("kind") === "post" ? "post" : "comment";
    const sentiment = query.get("sentiment") ?? "all";
    const questionOnly = query.get("question_only") === "true";
    const start = query.get("start") ?? "";
    const end = query.get("end") ?? "";
    const offset = Math.max(0, Number.parseInt(query.get("offset") ?? "0", 10) || 0);
    const limit = Math.min(100, Math.max(1, Number.parseInt(query.get("limit") ?? "20", 10) || 20));
    const topicData = topic ? data.topics[topic] : undefined;
    const chart = topicData?.charts[period] ?? data.global[period];
    if (!chart) return Response.json({ detail: "主题数据不存在" }, { status: 404 });

    let rows = (topicData?.items ?? []).filter((row) => row.kind === kind);
    if (start) rows = rows.filter((row) => !row.date || row.date >= start);
    if (end) rows = rows.filter((row) => !row.date || row.date <= end);
    if (kind === "comment" && questionOnly) rows = rows.filter((row) => row.is_question);

    const counts: Record<string, number> = { all: rows.length, positive: 0, negative: 0, neutral: 0, mixed: 0, non_opinion: 0 };
    if (kind === "comment") for (const row of rows) counts[sentimentClass(row)] += 1;
    if (kind === "comment" && sentiment !== "all") rows = rows.filter((row) => sentimentClass(row) === sentiment);

    return Response.json({
      ...chart,
      items: rows.slice(offset, offset + limit),
      total: rows.length,
      sentiment_counts: counts,
    }, { headers: mirrorCache });
  } catch (error) { return mirrorResponse(error); }
}
