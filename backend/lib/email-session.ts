export interface EmailSessionConfig {
  WORKBENCH_ALLOWED_EMAILS?: string;
  WORKBENCH_PASSWORD_PBKDF2?: string;
  WORKBENCH_SESSION_SECRET?: string;
}

export type SessionRole = 'owner' | 'viewer';
export type EmailSession = { email: string; role: SessionRole; expires: number };
const COOKIE = 'socialpulse_session';
const ITERATIONS = 100_000;
const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array | null {
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
    const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch { return null; }
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index++) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

function ownerEmails(config: EmailSessionConfig): string[] {
  return (config.WORKBENCH_ALLOWED_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
}

export function safeReturnTo(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/';
}

async function derivePassword(password: string, encoded: string): Promise<boolean> {
  const [version, iterationsValue, saltValue, expectedValue] = encoded.split('$');
  const iterations = Number(iterationsValue);
  const salt = base64UrlToBytes(saltValue || '');
  const expected = base64UrlToBytes(expectedValue || '');
  if (version !== 'v1' || iterations !== ITERATIONS || !salt || !expected || expected.length !== 32) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Uint8Array.from(salt), iterations }, key, 256));
  return constantTimeEqual(actual, expected);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256));
  return `v1$${ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(hash)}`;
}

export async function authenticateEmailPassword(email: string, password: string, config: EmailSessionConfig, db: D1Database): Promise<SessionRole | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password || password.length > 256) return null;
  if (ownerEmails(config).includes(normalizedEmail) && await derivePassword(password, config.WORKBENCH_PASSWORD_PBKDF2 || '')) return 'owner';
  const user = await db.prepare("SELECT password_hash, role FROM web_users WHERE email=? AND status='active'").bind(normalizedEmail).first<{ password_hash: string; role: string }>();
  if (!user || user.role !== 'viewer' || !await derivePassword(password, user.password_hash)) return null;
  await db.prepare('UPDATE web_users SET last_login_at=CURRENT_TIMESTAMP WHERE email=?').bind(normalizedEmail).run();
  return 'viewer';
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload))));
}

export async function createSessionCookie(email: string, role: SessionRole, config: EmailSessionConfig): Promise<string> {
  if ((config.WORKBENCH_SESSION_SECRET || '').length < 32) throw new Error('Session secret must contain at least 32 characters')
  const expires = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify({ email: email.trim().toLowerCase(), role, expires })));
  const signature = await sign(payload, config.WORKBENCH_SESSION_SECRET || '');
  return `${COOKIE}=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${7 * 24 * 60 * 60}`;
}

export async function getEmailSession(request: Request, config: EmailSessionConfig, db?: D1Database): Promise<EmailSession | null> {
  const secret = config.WORKBENCH_SESSION_SECRET || '';
  if (secret.length < 32) return null;
  const cookie = request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${COOKIE}=`));
  const [payload, suppliedSignature] = (cookie?.slice(COOKIE.length + 1) || '').split('.');
  if (!payload || !suppliedSignature) return null;
  const suppliedBytes = base64UrlToBytes(suppliedSignature);
  const expectedBytes = base64UrlToBytes(await sign(payload, secret));
  if (!suppliedBytes || !expectedBytes || !constantTimeEqual(suppliedBytes, expectedBytes)) return null;
  const decoded = base64UrlToBytes(payload);
  if (!decoded) return null;
  try {
    const session = JSON.parse(new TextDecoder().decode(decoded)) as EmailSession;
    if (!session.email || !['owner', 'viewer'].includes(session.role) || Number(session.expires) <= Date.now() / 1000) return null;
    if (session.role === 'owner' && !ownerEmails(config).includes(session.email)) return null;
    if (session.role === 'viewer' && db) {
      const active = await db.prepare("SELECT 1 AS ok FROM web_users WHERE email=? AND status='active' AND role='viewer'").bind(session.email).first<{ ok: number }>();
      if (!active) return null;
    }
    return session;
  } catch { return null; }
}

export async function emailSessionAuthorized(request: Request, config: EmailSessionConfig): Promise<boolean> {
  return Boolean(await getEmailSession(request, config));
}

export function clearSessionCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
