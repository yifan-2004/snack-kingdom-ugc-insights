import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

const bundle = await build({ entryPoints: ['lib/email-session.ts'], bundle: true, write: false, format: 'esm', platform: 'node' })
const auth = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const config = { WORKBENCH_ALLOWED_EMAILS: 'owner@example.test', WORKBENCH_SESSION_SECRET: 'unit-test-secret-with-at-least-32-characters' }
const cookie = (await auth.createSessionCookie('owner@example.test', 'owner', config)).split(';')[0]

async function runtime(t, extra = {}) {
  const root = fileURLToPath(new URL('../dist/server/', import.meta.url))
  const paths = (await readdir(root, { recursive: true })).filter(p => p.endsWith('.js') && p !== 'index.js')
  const mf = new Miniflare(convertV4MiniflareOptions({
    name: 'web-runtime-test', modulesRoot: root,
    modules: ['index.js', ...paths].map(p => ({ type: 'ESModule', path: join(root, p) })),
    compatibilityDate: '2026-10-06', compatibilityFlags: ['nodejs_compat'],
    d1Databases: ['DB'], bindings: { ...config, DEMO_DATA: 'true', ...extra },
  }))
  t.after(() => mf.dispose())
  const db = await mf.getD1Database('DB')
  // Review and evaluation tables are sufficient for these isolated HTTP tests.
  const migration = await readFile(new URL('../drizzle/0006_graceful_zombie.sql', import.meta.url), 'utf8')
  for (const sql of migration.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) await db.prepare(sql).run()
  return mf
}
const post = (body, owner = false) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(owner ? { Cookie: cookie, Origin: 'http://localhost' } : {}) },
  body: JSON.stringify(body),
})

test('session signatures reject tampering, weak keys and removed owners', async () => {
  assert.equal((await auth.getEmailSession(new Request('https://example.test', { headers: { Cookie: cookie } }), config))?.role, 'owner')
  assert.equal(await auth.getEmailSession(new Request('https://example.test', { headers: { Cookie: cookie + 'x' } }), config), null)
  assert.equal(await auth.getEmailSession(new Request('https://example.test', { headers: { Cookie: cookie } }), { ...config, WORKBENCH_ALLOWED_EMAILS: '' }), null)
  await assert.rejects(() => auth.createSessionCookie('owner@example.test', 'owner', { WORKBENCH_SESSION_SECRET: 'short' }))
})

test('demo scope and source records agree', async t => {
  const mf = await runtime(t)
  const overview = await (await mf.dispatchFetch('http://localhost/api/overview/latest')).json()
  const posts = await (await mf.dispatchFetch('http://localhost/api/processed-posts')).json()
  assert.equal(overview.sample_size, posts.total)
  assert.equal(overview.comment_count, 4)
  assert.equal(overview.opinion_weight + overview.non_opinion_weight, 4)
  const res = await mf.dispatchFetch('http://localhost/api/workbench/qa', post({ question: 'How many posts and comments?', locale: 'en' }))
  const answer = await res.json()
  assert.equal(res.status, 200)
  assert.match(answer.answer, /2 posts and 4 raw comments/)
  assert.equal(answer.modelUsed, false)
  assert.equal(answer.vectorStoreUsed, false)
})

test('topic filters isolate negative queue feedback from taste opinions', async t => {
  const mf = await runtime(t)
  const res = await mf.dispatchFetch('http://localhost/api/overview/explorer?topic=queue_time&kind=comment&sentiment=negative')
  const data = await res.json()
  assert.equal(data.total, 1)
  assert.equal(data.items[0].id, 'demo-c1')
  assert.ok(data.items.every(item => item.topic === 'queue_time'))
})

test('anonymous and cross-origin writes are rejected', async t => {
  const mf = await runtime(t)
  assert.equal((await mf.dispatchFetch('http://localhost/api/context-review', post({}))).status, 403)
  assert.equal((await mf.dispatchFetch('http://localhost/api/evaluation/runs', post({}))).status, 403)
  const forged = post({}, true); forged.headers.Origin = 'https://another.example'
  assert.equal((await mf.dispatchFetch('http://localhost/api/evaluation/runs', forged)).status, 403)
})

test('owner decisions persist and stale packet versions are rejected', async t => {
  const mf = await runtime(t)
  const body = { post_id: 'demo-p1', comment_id: 'demo-c2', expected_packet_hash: 'stale',
    attributes: { target: 'brand', sentiment: 'neutral', description: 'Question about quiet hours', evidence: ['When is the queue shortest?'] } }
  assert.equal((await mf.dispatchFetch('http://localhost/api/context-review', post(body, true))).status, 409)
  body.expected_packet_hash = 'demo-packet-v1'
  const saved = await mf.dispatchFetch('http://localhost/api/context-review', post(body, true))
  assert.equal(saved.status, 200)
  assert.equal((await saved.json()).derived_refresh_required, true)
  const queue = await (await mf.dispatchFetch('http://localhost/api/context-review')).json()
  assert.equal(queue.total, 0)
})

test('evaluation stores results separately from manual grades', async t => {
  const mf = await runtime(t)
  const created = await mf.dispatchFetch('http://localhost/api/evaluation/runs', post({ question_ids: ['SCOPE-001', 'QUEUE-001'], engine: 'parallel', concurrency: 2 }, true))
  assert.equal(created.status, 201)
  const run = await created.json()
  const stepped = await mf.dispatchFetch('http://localhost/api/evaluation/runs/' + run.id + '/step', post({}, true))
  const finished = await stepped.json()
  assert.equal(finished.status, 'completed')
  assert.equal(finished.results.length, 2)
  assert.ok(finished.results.every(row => row.human_correct === null))
  assert.equal(finished.config.concurrency, 2)
})

test('English login is available without external proxy mode', async t => {
  const mf = await runtime(t, { WORKBENCH_ENABLED: 'false' })
  const res = await mf.dispatchFetch('http://localhost/login')
  assert.equal(res.status, 200)
  assert.match(await res.text(), /<html lang="en">/)
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff')
})
