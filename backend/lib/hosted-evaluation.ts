import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { evaluationQuestions, evaluationResults, evaluationRuns } from "../db/schema";
import builtIn from "../evaluation/model-system-eval.json";

export type EvalQuestion = { id: string; question: string; category: string; reference_answer: string; rubric: string; signals: string[]; minimum_evidence: number };
export type EvalResult = { id: string; answer: string; error: string | null; latency_seconds: number; checks: Record<string, boolean | number | null>; human_correct: boolean | null; human_note: string; evidence: Array<{ chunk_id: string; post_id: string; text: string }> };

const builtIns: EvalQuestion[] = builtIn.questions.map(q => ({ id: q.id, question: q.question, category: q.category, reference_answer: "", rubric: q.manualRubric, signals: q.mustFindAny ?? [], minimum_evidence: q.minimumEvidence }));

export async function questions(): Promise<EvalQuestion[]> {
  const custom = await getDb().select().from(evaluationQuestions).orderBy(desc(evaluationQuestions.createdAt));
  return [...builtIns, ...custom.map(q => ({ id: q.id, question: q.question, category: q.category, reference_answer: q.referenceAnswer, rubric: q.rubric, signals: JSON.parse(q.signalsJson) as string[], minimum_evidence: q.minimumEvidence }))];
}

export async function run(id: string) {
  const db = getDb();
  const record = await db.select().from(evaluationRuns).where(eq(evaluationRuns.id, id)).get();
  if (!record) return null;
  const rows = await db.select().from(evaluationResults).where(eq(evaluationResults.runId, id));
  const questions = JSON.parse(record.questionsJson) as EvalQuestion[];
  const byId = new Map(rows.map(r => [r.questionId, r]));
  const results = questions.flatMap(q => {
    const row = byId.get(q.id);
    if (!row) return [];
    return [{ ...(JSON.parse(row.resultJson) as EvalResult), human_correct: row.humanCorrect === null ? null : Boolean(row.humanCorrect), human_note: row.humanNote ?? "" }];
  });
  return { id: record.id, created_at: record.createdAt, status: record.status, questions, results, config: JSON.parse(record.configJson), metrics: JSON.parse(record.metricsJson), source_signature: record.sourceSignature };
}

export async function runHistory() {
  const records = await getDb().select().from(evaluationRuns).orderBy(desc(evaluationRuns.createdAt)).limit(30);
  return records.map(r => ({ id: r.id, created_at: r.createdAt, status: r.status, questions: JSON.parse(r.questionsJson), results: [], config: JSON.parse(r.configJson), metrics: JSON.parse(r.metricsJson), source_signature: r.sourceSignature }));
}

export function metrics(results: EvalResult[], activeSeconds: number, completed: boolean, concurrency: number) {
  const durations = results.map(r => r.latency_seconds).sort((a, b) => a - b);
  const elapsed = Math.max(0.001, activeSeconds);
  const percentile = (p: number) => durations.length ? durations[Math.min(durations.length - 1, Math.ceil(durations.length * p) - 1)] : undefined;
  return { active_seconds: Number(elapsed.toFixed(2)), elapsed_seconds: Number(elapsed.toFixed(2)), throughput_qps: Number((results.length / elapsed).toFixed(3)), p50_seconds: percentile(.5), p95_seconds: percentile(.95), failure_rate: results.length ? results.filter(r => r.error).length / results.length : 0, max_concurrent_requests: Math.min(concurrency, results.length), worker_processes: 0 };
}
