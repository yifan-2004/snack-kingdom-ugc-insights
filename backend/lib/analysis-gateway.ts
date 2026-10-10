import { env } from "cloudflare:workers";
import { PublicRequestError, readJsonObject, readBoundedText } from "./request";
import { getEmailSession, type EmailSessionConfig } from "./email-session";

type Config = EmailSessionConfig & { DB?: D1Database; ANALYSIS_BACKEND_URL?: string; ANALYSIS_BACKEND_TOKEN?: string };

export function analysisConfig() { return env as unknown as Config; }

export async function authorizeAnalysis(request: Request, config: Config) {
  const session = await getEmailSession(request, config, config.DB);
  if (session?.role !== "owner") throw new PublicRequestError("analysis_access_required", 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new PublicRequestError("cross_origin_rejected",403);
}

export async function proxyAnalysis(request: Request, path: string) {
  const config = analysisConfig();
  const configured = Boolean(config.ANALYSIS_BACKEND_URL && config.ANALYSIS_BACKEND_TOKEN);
  if (!configured) {
    if (path === "capabilities" && request.method === "GET") return Response.json({mode:"unavailable", jobs:false,ray:false,model:false,review:false},{headers:{"Cache-Control":"no-store"}});
    throw new PublicRequestError("backend_not_configured", 503);
  }
  await authorizeAnalysis(request, config);
  if (!((request.method === "GET" && /^(capabilities|jobs)$/.test(path)) || (request.method === "POST" && /^(snapshot|report|ask|jobs|jobs\/[a-f0-9-]{36}\/(cancel|resume))$/.test(path)))) throw new PublicRequestError("unknown_analysis_route",404);
  const base = new URL(config.ANALYSIS_BACKEND_URL!);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/" || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[)/.test(base.hostname)) throw new PublicRequestError("invalid_backend_configuration",503);
  const body = request.method === "POST" ? JSON.stringify(await readJsonObject(request)) : undefined;
  const response = await fetch(new URL("/api/analysis/"+path, base), {
    method: request.method, redirect:"error", signal:AbortSignal.timeout(55000),
    headers:{Authorization:"Bearer "+config.ANALYSIS_BACKEND_TOKEN, ...(body ? {"Content-Type":"application/json"}:{})}, body,
  });
  // Do not forward cookies, redirects, stack traces or upstream headers.
  if (!response.headers.get("content-type")?.includes("application/json")) throw new PublicRequestError("analysis_backend_unavailable",502);
  const data: unknown = JSON.parse(await readBoundedText(new Request("https://response.invalid",{method:"POST",body:response.body,duplex:"half"} as RequestInit),2*1024*1024));
  if (!response.ok) {
    const detail = (data as {detail?: unknown})?.detail;
    const safe = new Set(["snapshot_changed","model_not_configured","narrow_scope_for_hyde","invalid_model_answer","no_eligible_comments","analysis_busy","job_not_found","job_not_resumable"]);
    return Response.json({detail: typeof detail==="string" && safe.has(detail) ? detail : "analysis_backend_error"},{status:response.status,headers:{"Cache-Control":"no-store"}});
  }
  return Response.json(data,{status:response.status,headers:{"Cache-Control":"private, no-store"}});
}
