import { Ui } from '../../i18n/Ui';
import { Globe, LoaderCircle, RefreshCw, Save, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost, apiPut } from '../../lib/api'
import type { WebSyncStatus } from '../../lib/types'

function formatTime(iso: string | null | undefined) {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false })
}

export function WebSyncCard() {
  const [status, setStatus] = useState<WebSyncStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [acting, setActing] = useState(false)
  const [site, setSite] = useState('')
  const [token, setToken] = useState('')

  const refresh = useCallback(async () => {
    try {
      const next = await apiGet<WebSyncStatus>('/api/web-sync/status')
      setStatus(next)
      setSite((current) => current || next.site || '')
      setError(null)
    } catch (reason) {
      setError((reason as Error).message)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (!status?.running) return
    const timer = window.setInterval(() => { void refresh() }, 3000)
    return () => window.clearInterval(timer)
  }, [status?.running, refresh])

  async function toggleAutoSync() {
    if (!status) return
    setActing(true); setMessage(null)
    try {
      await apiPut<WebSyncStatus>('/api/web-sync/settings', { auto_sync: !status.auto_sync })
      setMessage(status.auto_sync ? '已关闭流水线后的自动同步。' : '已开启：流水线发布阶段会自动增量同步到网站。')
      await refresh()
    } catch (reason) { setMessage((reason as Error).message) } finally { setActing(false) }
  }

  async function runNow(full = false) {
    setActing(true); setMessage(null)
    try {
      await apiPost('/api/web-sync/run', { full })
      setMessage(full
        ? '全部脱敏帖子已开始幂等重发；不会清空网站数据。'
        : 'V3 快照同步已开始，正在后台幂等上传变更的帖子。')
      await refresh()
    } catch (reason) { setMessage((reason as Error).message) } finally { setActing(false) }
  }

  function runAll() {
    if (!window.confirm('将重新上传全部脱敏帖子并发布新快照。该操作不会清空网站数据，是否继续？')) return
    void runNow(true)
  }

  async function saveSettings() {
    setActing(true); setMessage(null)
    try {
      await apiPut<WebSyncStatus>('/api/web-sync/settings', {
        site,
        ...(token.trim() ? { token: token.trim() } : {}),
      })
      setToken('')
      setMessage('同步站点已保存。请先执行“检查连接”，确认后再开启自动同步。')
      await refresh()
    } catch (reason) { setMessage((reason as Error).message) } finally { setActing(false) }
  }

  async function checkConnection() {
    setActing(true); setMessage(null)
    try {
      const next = await apiPost<WebSyncStatus>('/api/web-sync/check', {})
      setStatus(next)
      setMessage(next.last_check?.message ?? '连接检查完成。')
    } catch (reason) { setMessage((reason as Error).message) } finally { setActing(false) }
  }

  const lastRun = status?.last_run
  return <Ui as="section" className="pipeline-status web-sync-panel" aria-label="网站同步">
    <Ui as="div" className="section-heading">
      <Ui as="div"><Ui as="h2">网站同步</Ui><Ui as="p">通过 V3 快照协议幂等推送脱敏帖子；只有最后一批成功后才会发布，不会远程清空数据。</Ui></Ui>
      {status ? <Ui as="span" className="pipeline-complete-actions">
        <Ui as="button" className="text-button" type="button" disabled={acting || status.running || !status.configured} onClick={runAll}>重新推送全部</Ui>
        <Ui as="button" className="primary-button" type="button" disabled={acting || status.running || !status.configured} onClick={() => void runNow()}>
          {status.running ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
          {status.running ? '正在同步…' : '立即同步'}
        </Ui>
      </Ui> : null}
    </Ui>
    {error ? <Ui as="div" className="inline-state error">同步状态读取失败:{error}</Ui> : null}
    {status ? <Ui as="div" className="web-sync-body">
      <Ui as="div" className="web-sync-row"><Ui as="span" className="web-sync-label"><Globe size={13} aria-hidden="true" />目标站点</Ui>{status.site ? <Ui as="a" className="web-sync-site" href={status.site} target="_blank" rel="noreferrer">{status.site}</Ui> : <Ui as="strong">尚未配置</Ui>}</Ui>
      <Ui as="div" className="web-sync-row"><Ui as="span" className="web-sync-label">轻量站地址</Ui><Ui as="input" value={site} onChange={(event) => setSite(event.target.value)} placeholder="https://your-lite-site.example" disabled={acting} /></Ui>
      <Ui as="div" className="web-sync-row"><Ui as="span" className="web-sync-label">同步令牌</Ui><Ui as="input" type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="首次配置或轮换时填写" disabled={acting} autoComplete="new-password" /></Ui>
      <Ui as="div" className="web-sync-row"><Ui as="span" className="web-sync-label">连接配置</Ui><Ui as="span"><Ui as="button" className="text-button" type="button" disabled={acting || !site?.trim()} onClick={() => void saveSettings()}><Save size={13} aria-hidden="true" />保存</Ui><Ui as="button" className="text-button" type="button" disabled={acting || !status.configured} onClick={() => void checkConnection()}><ShieldCheck size={13} aria-hidden="true" />检查连接</Ui></Ui></Ui>
      <Ui as="div" className="web-sync-row"><Ui as="span" className="web-sync-label">自动同步</Ui>
        <Ui as="label" className="check-field"><Ui as="input" type="checkbox" checked={status.auto_sync} disabled={acting || !status.configured} onChange={() => void toggleAutoSync()} />流水线发布阶段自动推送</Ui>
      </Ui>
      <Ui as="div" className="web-sync-row"><Ui as="span" className="web-sync-label">待同步帖子</Ui><Ui as="strong">{status.pending_count} 篇</Ui></Ui>
      <Ui as="div" className="web-sync-row"><Ui as="span" className="web-sync-label">上次同步</Ui>
        {lastRun
          ? <Ui as="span">{formatTime(lastRun.finished_at)} · {lastRun.published === true ? '已发布' : lastRun.published === false ? '未发布' : '旧版状态'} {lastRun.synced} 篇 / 跳过 {lastRun.skipped} 篇{lastRun.failed ? ` / 失败 ${lastRun.failed} 篇` : ''}{lastRun.full ? ' · 全量幂等重发' : ''}</Ui>
          : <Ui as="span">尚未同步过</Ui>}
      </Ui>
      <Ui as="div" className="web-sync-row"><Ui as="span" className="web-sync-label">连通性</Ui><Ui as="span">{status.last_check ? `${formatTime(status.last_check.checked_at)} · ${status.last_check.ok ? '已验证' : '未通过'}${status.last_check.protocol ? ` · ${status.last_check.protocol}` : ''}` : '尚未检查'}</Ui></Ui>
      {lastRun?.errors.length ? <Ui as="p" className="form-message error" role="alert">{lastRun.errors[0]}</Ui> : null}
      {!status.configured ? <Ui as="p" className="form-message" role="status">尚未配置同步令牌，请联系管理员。</Ui> : null}
      {message ? <Ui as="p" className="form-message" role="status">{message}</Ui> : null}
    </Ui> : !error ? <Ui as="div" className="inline-state">正在读取同步状态…</Ui> : null}
  </Ui>
}
