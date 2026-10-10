import { workbenchRouteAllowed, workbenchViewerRouteAllowed } from './workbench-policy.ts';

export interface WorkbenchConfig {
  WORKBENCH_ENABLED?: string;
  WORKBENCH_BACKEND_URL?: string;
  WORKBENCH_BACKEND_TOKEN?: string;
  WORKBENCH_ALLOWED_USER_IDS?: string;
  WORKBENCH_ALLOWED_EMAILS?: string;
  WORKBENCH_PASSWORD_PBKDF2?: string;
  WORKBENCH_SESSION_SECRET?: string;
}

export function validWorkbenchOrigin(value: string): URL | null {
  try {
    const base = new URL(value);
    // Require a DNS hostname and TLS. No private IPs, credentials or URL-controlled paths.
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/' ||
        !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(base.hostname) ||
        /(^|\.)(localhost|local|internal)$/i.test(base.hostname) || (base.port && base.port !== '443')) return null;
    return base;
  } catch { return null; }
}

export async function proxyWorkbench(request: Request, config: WorkbenchConfig, upstreamFetch: typeof fetch = fetch, sessionRole: 'owner' | 'viewer' | true | false = false): Promise<Response> {
  const fail = (detail: string, status: number) => Response.json({ detail }, { status, headers: { 'Cache-Control': 'private, no-store' } });
  if (!sessionRole) return fail('请先登录 / Sign in required', 401);
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') return fail('跨站请求被拒绝 / Cross-site request rejected', 403);
  if (!workbenchRouteAllowed(request.method, url.pathname)) return fail('此功能尚未接入云端 / Not connected to the cloud yet', 404);
  if (sessionRole === 'viewer' && !workbenchViewerRouteAllowed(request.method, url.pathname)) return fail('当前账号为只读账号 / Read-only account', 403);
  const base = validWorkbenchOrigin(config.WORKBENCH_BACKEND_URL || '');
  if (!base || (config.WORKBENCH_BACKEND_TOKEN || '').length < 32) return fail('云端服务尚未配置 / Cloud service not configured', 503);
  let body: Uint8Array | undefined;
  if (!['GET', 'HEAD'].includes(request.method)) {
    if (request.body) {
      if (!request.headers.get('content-type')?.startsWith('application/json')) return fail('仅接受 JSON 请求 / JSON required', 415);
      const reader = request.body.getReader();
      const parts: Uint8Array[] = []; let size = 0;
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 2 * 1024 * 1024) { await reader.cancel(); return fail('请求过大 / Request too large', 413); }
        parts.push(value);
      }
      body = new Uint8Array(size); let offset = 0;
      for (const part of parts) { body.set(part, offset); offset += part.byteLength; }
    }
  }
  const target = new URL(url.pathname + url.search, base);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  request.signal.addEventListener('abort', cancel, { once: true });
  // The first response byte has a deadline; streaming reports may continue afterwards.
  const timeout = setTimeout(cancel, 55000);
  try {
    const response = await upstreamFetch(target, {
      method: request.method, redirect: 'manual', signal: controller.signal,
      headers: { Authorization: `Bearer ${config.WORKBENCH_BACKEND_TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body as BodyInit | undefined,
    });
    clearTimeout(timeout);
    if (!response.ok) {
      await response.body?.cancel();
      return fail('操作未完成，请重试或检查云端任务 / Operation failed; check cloud task status', response.status >= 400 && response.status < 600 ? response.status : 502);
    }
    const headers = new Headers({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    // Preserve streaming, media and downloads; never forward upstream cookies or auth headers.
    for (const name of ['Content-Type', 'Content-Disposition', 'Content-Length']) {
      const value = response.headers.get(name); if (value) headers.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    console.error('Workbench upstream fetch failed', error instanceof Error ? error.message : String(error));
    return fail('云端服务连接失败 / Cloud service unavailable', 502);
  }
  finally { clearTimeout(timeout); request.signal.removeEventListener('abort', cancel); }
}
