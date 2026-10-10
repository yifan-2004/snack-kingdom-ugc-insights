import { run } from "../../../../../lib/hosted-evaluation";

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const item = await run(runId);
  return item ? Response.json(item, { headers: { "Cache-Control": "no-store" } }) : Response.json({ detail: "评估记录不存在" }, { status: 404 });
}
