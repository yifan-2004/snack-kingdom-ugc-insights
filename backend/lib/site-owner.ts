import { env } from 'cloudflare:workers'
import { headers } from 'next/headers'
import { getEmailSession, type EmailSessionConfig } from './email-session'
export async function ownerIdentity(request?: Request): Promise<string | null> {
  const config = env as unknown as EmailSessionConfig & { DB?: D1Database }
  const source = request ?? new Request('https://workbench.invalid', { headers: await headers() })
  if (request) {
    const origin = request.headers.get('origin')
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') return null
  }
  const session = await getEmailSession(source, config, config.DB)
  return session?.role === 'owner' ? session.email : null
}
export async function requireOwner(request: Request): Promise<string | Response> {
  return await ownerIdentity(request) ?? Response.json({ detail: 'Sign in as the owner to continue.' }, { status: 403 })
}
