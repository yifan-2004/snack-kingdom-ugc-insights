import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { evaluationResults, evaluationRuns } from "../../../../db/schema";
import { run } from "../../../../lib/hosted-evaluation";
import { requireOwner } from "../../../../lib/site-owner";

export async function POST(request: Request) {
  const actor = await requireOwner(request); if (actor instanceof Response) return actor;
  try {
    const body = await request.json() as Record<string, unknown>;
    const runId = String(body.run_id ?? ""); const questionId = String(body.question_id ?? "");
    const note = String(body.note ?? "").trim();
    if (!runId || !questionId || typeof body.correct !== "boolean" || !note || note.length > 1000) return Response.json({ detail: "请填写判分依据" }, { status: 400 });
    const db = getDb();
    const record = await db.select().from(evaluationRuns).where(eq(evaluationRuns.id, runId)).get();
    if (!record || record.status !== "completed") return Response.json({ detail: "只能对已完成的评估判分" }, { status: 409 });
    const updated = await db.update(evaluationResults).set({ humanCorrect: body.correct ? 1 : 0, humanNote: note, gradedAt: new Date().toISOString() }).where(and(eq(evaluationResults.runId, runId), eq(evaluationResults.questionId, questionId))).returning();
    if (!updated.length) return Response.json({ detail: "题目结果不存在" }, { status: 404 });
    return Response.json(await run(runId));
  } catch { return Response.json({ detail: "判分保存失败" }, { status: 400 }); }
}
