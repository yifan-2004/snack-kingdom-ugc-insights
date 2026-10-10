import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { evaluationRuns } from "../../../../db/schema";
import { requireOwner } from "../../../../lib/site-owner";

export async function POST(request: Request) {
  const actor = await requireOwner(request); if (actor instanceof Response) return actor;
  const body = await request.json().catch(() => ({})) as { run_id?: string };
  if (!body.run_id) return Response.json({ detail: "缺少运行编号" }, { status: 400 });
  await getDb().update(evaluationRuns).set({ status: "cancelled", completedAt: new Date().toISOString() }).where(eq(evaluationRuns.id, body.run_id));
  return Response.json({ ok: true });
}
