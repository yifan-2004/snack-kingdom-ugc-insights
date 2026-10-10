import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { evaluationResults, evaluationRuns } from "../../../../../../db/schema";
import { metrics, run, type EvalQuestion, type EvalResult } from "../../../../../../lib/hosted-evaluation";
import { answerMirror, mirrorSignature } from "../../../../../../lib/mirror-qa";
import { requireOwner } from "../../../../../../lib/site-owner";

async function evaluate(question: EvalQuestion): Promise<EvalResult> {
  const started = performance.now();
  try {
    const answer = await answerMirror(question.question);
    const evidence = answer.evidence.map(e => ({ chunk_id: e.chunkId, post_id: e.postId, text: e.excerpt }));
    const present = Boolean(answer.answer.trim());
    return { id: question.id, answer: answer.answer, error: null, latency_seconds: Number(((performance.now() - started) / 1000).toFixed(3)), checks: { answer_present: present, enough_evidence: evidence.length >= question.minimum_evidence, citation_ids_valid: evidence.every(e => Boolean(e.chunk_id && e.post_id)), signal_coverage: question.signals.length ? question.signals.filter(s => answer.answer.includes(s)).length / question.signals.length : null }, human_correct: null, human_note: "", evidence };
  } catch (error) {
    return { id: question.id, answer: "", error: error instanceof Error ? error.message.slice(0, 300) : "评估请求失败", latency_seconds: Number(((performance.now() - started) / 1000).toFixed(3)), checks: {}, human_correct: null, human_note: "", evidence: [] };
  }
}

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  const actor = await requireOwner(request); if (actor instanceof Response) return actor;
  const { runId } = await context.params;
  const db = getDb();
  const record = await db.select().from(evaluationRuns).where(eq(evaluationRuns.id, runId)).get();
  if (!record) return Response.json({ detail: "评估记录不存在" }, { status: 404 });
  if (record.status !== "running") return Response.json(await run(runId));
  if (record.sourceSignature !== await mirrorSignature()) {
    await db.update(evaluationRuns).set({ status: "invalidated", completedAt: new Date().toISOString() }).where(eq(evaluationRuns.id, runId));
    return Response.json(await run(runId));
  }
  const questions = JSON.parse(record.questionsJson) as EvalQuestion[];
  const config = JSON.parse(record.configJson) as { concurrency: number; engine: string };
  const done = await db.select({ questionId: evaluationResults.questionId }).from(evaluationResults).where(eq(evaluationResults.runId, runId));
  const ids = new Set(done.map(r => r.questionId));
  const next = questions.filter(q => !ids.has(q.id)).slice(0, config.engine === "serial" ? 1 : Math.min(4, config.concurrency));
  if (!next.length) return Response.json(await run(runId));
  try {
    const batchStarted = performance.now();
    const values = await Promise.all(next.map(q => evaluate(q)));
    for (const result of values) await db.insert(evaluationResults).values({ runId, questionId: result.id, resultJson: JSON.stringify(result) }).onConflictDoNothing();
    const current = await run(runId);
    if (!current) throw new Error("Run disappeared");
    const complete = current.results.length === questions.length;
    const prior = JSON.parse(record.metricsJson) as { active_seconds?: number };
    const active = (prior.active_seconds ?? 0) + (performance.now() - batchStarted) / 1000;
    await db.update(evaluationRuns).set({ status: complete ? "completed" : "running", completedAt: complete ? new Date().toISOString() : null, metricsJson: JSON.stringify(metrics(current.results, active, complete, config.concurrency)) }).where(eq(evaluationRuns.id, runId));
    return Response.json(await run(runId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { console.error("evaluation step failed", error); return Response.json({ detail: "本批次评估失败，可再次点击继续，不会重算已保存题目" }, { status: 503 }); }
}
