import { proxyAnalysis } from "../../../../lib/analysis-gateway";
import { enforceRateLimit, errorResponse } from "../../../../lib/request";

async function handle(request: Request) {
  try {
    enforceRateLimit(request,"reviewed-analysis",30);
    const path = new URL(request.url).pathname.slice("/api/analysis/".length);
    return await proxyAnalysis(request,path);
  } catch (error) { return errorResponse(error,"analysis_backend_unavailable"); }
}
export const GET = handle;
export const POST = handle;
