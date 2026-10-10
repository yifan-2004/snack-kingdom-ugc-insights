import { analyzeSnapshot, loadSnapshot } from "../../../lib/intelligence";
import {
  enforceRateLimit,
  errorResponse,
  postIdsFrom,
  readJsonObject,
} from "../../../lib/request";

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "analysis", 30);
    const body = await readJsonObject<{ postIds?: unknown }>(request);
    const rows = await loadSnapshot(postIdsFrom(body.postIds));
    return Response.json({ analysis: analyzeSnapshot(rows) });
  } catch (error) {
    return errorResponse(error, "分析暂不可用，请稍后重试");
  }
}
