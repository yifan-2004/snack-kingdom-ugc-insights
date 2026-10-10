import { answerMirror } from "../../../../lib/mirror-qa";
import { enforceRateLimit, errorResponse } from "../../../../lib/request";

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "rag", 30);
    const body = await request.json() as { question?: unknown; locale?: unknown };
    const question = String(body.question ?? "").trim();
    if (question.length < 2 || question.length > 500) return Response.json({ detail: "问题需要 2–500 个字符" }, { status: 400 });
    return Response.json(await answerMirror(question, body.locale === "en" ? "en" : "zh-CN"));
  } catch (error) { return errorResponse(error, "问答暂不可用"); }
}
