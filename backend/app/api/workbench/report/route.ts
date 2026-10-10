import { reportMirror } from "../../../../lib/mirror-qa";
import { enforceRateLimit, errorResponse } from "../../../../lib/request";

export async function POST(request: Request) {
  try { enforceRateLimit(request, "report", 12); const body = await request.json().catch(() => ({})) as { locale?: unknown }; return Response.json({ report: await reportMirror(body.locale === "en" ? "en" : "zh-CN"), source: "local-app-mirror" }); }
  catch (error) { return errorResponse(error, "报告暂不可用"); }
}
