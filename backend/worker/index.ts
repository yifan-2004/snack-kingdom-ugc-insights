/** Cloudflare Worker entry point for the application. */
import {
  handleImageOptimization,
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { proxyWorkbench, type WorkbenchConfig } from '../lib/workbench-gateway';
import { workbenchPage } from '../lib/workbench-policy';
import { authenticateEmailPassword, clearSessionCookie, createSessionCookie, getEmailSession, hashPassword, safeReturnTo } from '../lib/email-session';

interface Env extends WorkbenchConfig {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: {
          format: string;
          quality: number;
        }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // Roll out only after the persistent backend, data parity and owner login pass QA.
    // Default-off preserves the current publication while cloud access is being set up.
    {
      if (url.pathname === '/login' && request.method === 'GET') {
        if (await getEmailSession(request, env, env.DB)) return withSecurityHeaders(Response.redirect(new URL(safeReturnTo(url.searchParams.get('return_to')), url), 302));
        return withSecurityHeaders(loginPage(safeReturnTo(url.searchParams.get('return_to'))));
      }
      if (url.pathname === '/register' && request.method === 'GET') {
        if (await getEmailSession(request, env, env.DB)) return withSecurityHeaders(Response.redirect(new URL('/', url), 302));
        return withSecurityHeaders(registerPage());
      }
      if (url.pathname === '/session/login' && request.method === 'POST') {
        if (!sameOriginForm(request, url) || !await authRateAllowed(request, env)) return withSecurityHeaders(loginPage('/', 'Too many attempts. Try again later.', 429));
        const form = await request.formData();
        const email = String(form.get('email') || '');
        const password = String(form.get('password') || '');
        const returnTo = safeReturnTo(String(form.get('return_to') || '/'));
        const role = await authenticateEmailPassword(email, password, env, env.DB);
        if (!role) return withSecurityHeaders(loginPage(returnTo, 'Invalid email or password.', 401));
        const headers = new Headers({ Location: returnTo, 'Cache-Control': 'private, no-store' });
        headers.append('Set-Cookie', await createSessionCookie(email, role, env));
        return withSecurityHeaders(new Response(null, { status: 303, headers }));
      }
      if (url.pathname === '/session/register' && request.method === 'POST') {
        if (!sameOriginForm(request, url) || !await authRateAllowed(request, env)) return withSecurityHeaders(registerPage('Too many attempts. Try again later.', 429));
        const form = await request.formData();
        const email = String(form.get('email') || '').trim().toLowerCase();
        const password = String(form.get('password') || '');
        const confirmation = String(form.get('confirmation') || '');
        const validationError = registrationError(email, password, confirmation);
        if (validationError) return withSecurityHeaders(registerPage(validationError, 400, email));
        if ((env.WORKBENCH_ALLOWED_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).includes(email)) return withSecurityHeaders(registerPage('This email already exists. Please sign in.', 409, email));
        try {
          await env.DB.prepare("INSERT INTO web_users(email,password_hash,role,status) VALUES(?,?,'viewer','active')").bind(email, await hashPassword(password)).run();
        } catch {
          return withSecurityHeaders(registerPage('This email is already registered.', 409, email));
        }
        const headers = new Headers({ Location: '/', 'Cache-Control': 'private, no-store' });
        headers.append('Set-Cookie', await createSessionCookie(email, 'viewer', env));
        return withSecurityHeaders(new Response(null, { status: 303, headers }));
      }
      if (url.pathname === '/logout') {
        const headers = new Headers({ Location: '/login', 'Cache-Control': 'private, no-store', 'Set-Cookie': clearSessionCookie() });
        return withSecurityHeaders(new Response(null, { status: 303, headers }));
      }
      if (env.WORKBENCH_ENABLED === 'true' && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/'))) {
        const session = await getEmailSession(request, env, env.DB);
        return withSecurityHeaders(await proxyWorkbench(request, env, fetch, session?.role || false));
      }
      const page = workbenchPage(url.pathname);
      if (env.WORKBENCH_ENABLED === 'true' && page !== null) {
        const session = await getEmailSession(request, env, env.DB);
        if (!session) {
          return withSecurityHeaders(Response.redirect(new URL('/login?return_to=' + encodeURIComponent(url.pathname + url.search), url), 302));
        }
        if (page) return withSecurityHeaders(Response.redirect(new URL('/?page=' + page, url), 302));
        const response = await env.ASSETS.fetch(new Request(new URL('/workbench/index.html', url)));
        const headers = new Headers(response.headers); headers.set('Cache-Control', 'private, no-store');
        const html = await response.text();
        const roleScript = `<script>window.__SOCIALPULSE_ROLE__=${JSON.stringify(session.role)}</script>`;
        return withSecurityHeaders(new Response(html.replace('</head>', `${roleScript}</head>`), { status: response.status, headers }));
      }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(
        request,
        {
          fetchAsset: (path) =>
            env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body)
              .transform(width > 0 ? { width } : {})
              .output({ format, quality });
            return result.response();
          },
        },
        allowedWidths,
      );
      return withSecurityHeaders(response);
    }

    return withSecurityHeaders(await handler.fetch(request, env, ctx));
  },
};

export default worker;

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' https: data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "connect-src 'self'",
    ].join("; "),
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character);
}

function sameOriginForm(request: Request, url: URL): boolean {
  const length = Number(request.headers.get('content-length') || 0);
  return request.headers.get('origin') === url.origin && (request.headers.get('content-type') || '').startsWith('application/x-www-form-urlencoded') && length > 0 && length <= 4096;
}

async function authRateAllowed(request: Request, env: Env): Promise<boolean> {
  const source = `${env.WORKBENCH_SESSION_SECRET || ''}:${request.headers.get('cf-connecting-ip') || 'unknown'}`;
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))), value => value.toString(16).padStart(2, '0')).join('');
  const window = Math.floor(Date.now() / 600_000);
  const row = await env.DB.prepare(`INSERT INTO web_auth_rate(subject,window,count) VALUES(?,?,1)
    ON CONFLICT(subject) DO UPDATE SET window=excluded.window,count=CASE WHEN web_auth_rate.window=excluded.window THEN web_auth_rate.count+1 ELSE 1 END RETURNING count`).bind(digest, window).first<{ count: number }>();
  return (row?.count || 99) <= 12;
}

function registrationError(email: string, password: string, confirmation: string): string | null {
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.';
  if (password.length < 12 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) return 'Use 12–128 characters with uppercase, lowercase and a number.';
  if (password !== confirmation) return 'Passwords do not match.';
  return null;
}

const AUTH_STYLE = `:root{color-scheme:light;--paper:#fffcf5;--cream:#fff9ef;--ink:#4a3423;--muted:#876f57;--line:rgba(121,94,63,.18);--accent:#28634b}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 15% 10%,#fff1db 0,transparent 35%),var(--cream);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}.card{width:min(100%,430px);padding:38px;border:1px solid var(--line);border-radius:24px;background:rgba(255,252,245,.96);box-shadow:0 24px 70px rgba(74,52,35,.12)}.brand{display:flex;align-items:center;gap:12px;margin-bottom:34px}.mark{display:grid;place-items:center;width:44px;height:44px;border-radius:14px;background:#fff0de;font-size:23px}.brand strong{display:block;font-size:18px}.brand small{display:block;margin-top:2px;color:var(--muted);font-size:11px;letter-spacing:.14em}h1{margin:0 0 8px;font-size:28px}p{margin:0 0 24px;color:var(--muted);line-height:1.55}label{display:block;margin:16px 0 7px;font-size:14px;font-weight:700}input{width:100%;min-height:48px;padding:0 14px;border:1px solid var(--line);border-radius:12px;background:white;color:var(--ink);font:inherit;outline:none}input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(40,99,75,.12)}button{width:100%;min-height:50px;margin-top:24px;border:0;border-radius:12px;background:var(--accent);color:white;font:700 16px inherit;cursor:pointer}.error{margin:0 0 14px;padding:11px 13px;border-radius:10px;background:#fff0eb;color:#a04432;font-size:14px}footer{margin-top:22px;text-align:center;color:var(--muted);font-size:13px}a{color:var(--accent);font-weight:700;text-decoration:none}`;

function authDocument(title: string, content: string, status = 200): Response {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#fff9ef"><title>${escapeHtml(title)} · Snack Kingdom</title><style>${AUTH_STYLE}</style></head><body><main class="card"><div class="brand"><span class="mark">◉</span><span><strong>Snack Kingdom</strong><small>SOCIAL LISTENING</small></span></div>${content}</main></body></html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' } });
}

function loginPage(returnTo: string, error = '', status = 200): Response {
  return authDocument('Sign in', `<h1>Sign in</h1><p>Open your consumer insights workbench.</p>${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ''}<form method="post" action="/session/login"><input type="hidden" name="return_to" value="${escapeHtml(returnTo)}"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required autofocus><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required><button type="submit">Sign in</button></form><footer>New here? <a href="/register">Create an account</a></footer>`, status);
}

function registerPage(error = '', status = 200, email = ''): Response {
  return authDocument('Register', `<h1>Create an account</h1><p>Registered viewers can explore insights. Management tools require an owner account.</p>${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ''}<form method="post" action="/session/register"><label for="email">Email</label><input id="email" name="email" type="email" maxlength="254" value="${escapeHtml(email)}" autocomplete="username" required autofocus><label for="password">Password</label><input id="password" name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required><label for="confirmation">Confirm password</label><input id="confirmation" name="confirmation" type="password" minlength="12" maxlength="128" autocomplete="new-password" required><button type="submit">Create account</button></form><footer>Already registered? <a href="/login">Sign in</a></footer>`, status);
}
