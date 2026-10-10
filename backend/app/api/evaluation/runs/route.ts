import { getDb } from "../../../../db";
import { evaluationRuns } from "../../../../db/schema";
import { questions, run, runHistory } from "../../../../lib/hosted-evaluation";
import { mirrorSignature } from "../../../../lib/mirror-qa";
import { requireOwner } from "../../../../lib/site-owner";

export async function GET() { return Response.json(await runHistory(), { headers: { "Cache-Control": "no-store" } }); }

export async function POST(request: Request) {
  const actor = await requireOwner(request); if (actor instanceof Response) return actor;
  try {
    const body = await request.json() as Record<string, unknown>;
    const ids = body.question_ids;
    const engine = body.engine === "serial" ? "serial" : "parallel";
    const concurrency = engine === "serial" ? 1 : Math.max(1, Math.min(4, Number(body.concurrency) || 2));
    if (!Array.isArray(ids) || !ids.length || ids.length > 200 || !ids.every(v => typeof v === "string"))
      return Response.json({ detail: "请选择 1–200 道题" }, { status: 400 });
    const all = await questions(); const byId = new Map(all.map(q => [q.id, q]));
    const selection = [...new Set(ids)].map(id => byId.get(id));
    if (selection.some(q => !q)) return Response.json({ detail: "选中的题目不存在" }, { status: 400 });
    const now = new Date().toISOString(); const id = crypto.randomUUID();
    await getDb().insert(evaluationRuns).values({ id, createdAt: now, status: "running", configJson: JSON.stringify({ engine, concurrency }), questionsJson: JSON.stringify(selection), sourceSignature: await mirrorSignature(), metricsJson: "{}" });
    return Response.json(await run(id), { status: 201 });
  } catch { return Response.json({ detail: "创建评估失败" }, { status: 400 }); }
}
