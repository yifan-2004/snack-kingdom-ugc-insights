import { getDb } from "../../../../db";
import { evaluationQuestions } from "../../../../db/schema";
import { questions } from "../../../../lib/hosted-evaluation";
import { requireOwner } from "../../../../lib/site-owner";

export async function GET() { return Response.json(await questions(), { headers: { "Cache-Control": "no-store" } }); }

export async function POST(request: Request) {
  const actor = await requireOwner(request); if (actor instanceof Response) return actor;
  try {
    const body = await request.json() as Record<string, unknown>;
    const question = String(body.question ?? "").trim();
    const category = String(body.category ?? "自定义").trim();
    const reference = String(body.reference_answer ?? "").trim();
    const rubric = String(body.rubric ?? "").trim();
    const minimum = Number(body.minimum_evidence ?? 1);
    if (question.length < 2 || question.length > 500 || !category || category.length > 80 || reference.length > 6000 || rubric.length > 2000 || !Number.isInteger(minimum) || minimum < 0 || minimum > 20)
      return Response.json({ detail: "题目内容或长度不符合要求" }, { status: 400 });
    const count = await getDb().select().from(evaluationQuestions);
    if (count.length >= 500) return Response.json({ detail: "自定义题目已达到上限" }, { status: 400 });
    const item = { id: crypto.randomUUID(), question, category, reference_answer: reference, rubric, signals: [] as string[], minimum_evidence: minimum };
    await getDb().insert(evaluationQuestions).values({ id: item.id, question, category, referenceAnswer: reference, rubric, minimumEvidence: minimum, createdAt: new Date().toISOString() });
    return Response.json(item, { status: 201 });
  } catch { return Response.json({ detail: "新增题目失败" }, { status: 400 }); }
}
