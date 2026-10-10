import {
  analyzeSnapshot,
  loadSnapshot,
} from "../../../lib/intelligence";
import { localizedReport, outputLocale } from "../../../lib/localized-analysis";
import {
  enforceRateLimit,
  errorResponse,
  postIdsFrom,
  readJsonObject,
} from "../../../lib/request";

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "report", 12);
    const body = await readJsonObject<{ postIds?: unknown; locale?: unknown }>(request);
    const locale = outputLocale(body.locale);
    const rows = await loadSnapshot(postIdsFrom(body.postIds));
    if (!rows.length)
      return Response.json(
        { error: "当前范围没有可用于报告的帖子" },
        { status: 400 },
      );
    const analysis = analyzeSnapshot(rows);
    return Response.json({ report: localizedReport(rows, analysis, locale), analysis, locale });
  } catch (error) {
    return errorResponse(error, "报告暂不可用，请稍后重试");
  }
}
