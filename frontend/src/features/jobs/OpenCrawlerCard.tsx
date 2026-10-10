import { Ui } from '../../i18n/Ui';
import { Bug, CalendarClock, LoaderCircle, Play, QrCode } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet, apiPost, apiPut } from '../../lib/api'
import type { CrawlerStatus } from '../../lib/types'

function formatTime(iso: string | null | undefined) {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false })
}

const platformNames: Record<string, string> = { xhs: '小红书', dy: '抖音' }

export function OpenCrawlerCard() {
  const [status, setStatus] = useState<CrawlerStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [acting, setActing] = useState(false)
  const [timeInput, setTimeInput] = useState('07:30')
  const [keywordInput, setKeywordInput] = useState('零食王国')
  const lastSchedule = useRef<{ time: string; keywords: string } | null>(null)

  const refresh = useCallback(async () => {
    try {
      const next = await apiGet<CrawlerStatus>('/api/crawler/status')
      if (!next || typeof next !== 'object' || !('schedule' in next) || !('logged_in' in next)) {
        throw new Error('爬虫状态格式异常')
      }
      // 仅在服务器配置变化时回填输入框，避免采集中的轮询覆盖用户正在编辑的内容
      const keywords = next.schedule.keywords.join('，')
      if (lastSchedule.current?.time !== next.schedule.time) setTimeInput(next.schedule.time)
      if (lastSchedule.current?.keywords !== keywords) setKeywordInput(keywords)
      lastSchedule.current = { time: next.schedule.time, keywords }
      setStatus(next)
      setError(null)
    } catch (reason) {
      setError((reason as Error).message)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (!status?.running) return
    const timer = window.setInterval(() => { void refresh() }, 5000)
    return () => window.clearInterval(timer)
  }, [status?.running, refresh])

  async function saveSchedule(patch: { enabled?: boolean; time?: string; keywords?: string[] }, success: string) {
    setActing(true); setMessage(null)
    try {
      await apiPut<CrawlerStatus>('/api/crawler/schedule', patch)
      setMessage(success)
      await refresh()
    } catch (reason) { setMessage((reason as Error).message) } finally { setActing(false) }
  }

  async function runNow() {
    setActing(true); setMessage(null)
    try {
      await apiPost('/api/crawler/run-now')
      setMessage('采集已开始，新帖子会自动进入处理、向量库与网站同步。')
      await refresh()
    } catch (reason) { setMessage((reason as Error).message) } finally { setActing(false) }
  }

  async function startLogin(platform: string) {
    setActing(true); setMessage(null)
    try {
      const result = await apiPost<{ started: boolean }>(`/api/crawler/login/${platform}`)
      setMessage(result.started
        ? `${platformNames[platform] ?? platform}登录窗口已弹出，请在浏览器中扫码，登录态会自动保存。`
        : '该平台登录窗口已在运行中，请直接在浏览器窗口内扫码。')
    } catch (reason) { setMessage((reason as Error).message) } finally { setActing(false) }
  }

  const lastResult = status?.last_result
  const platformSummary = lastResult
    ? Object.entries(lastResult.platforms || {})
        .map(([platform, row]) => `${platformNames[platform] ?? platform} ${row.new_posts} 新 / ${row.posts} 帖 / ${row.comments} 评论`)
        .join(' · ')
    : ''

  return <Ui as="section" className="pipeline-status web-sync-panel" aria-label="开源爬虫每日自动采集">
    <Ui as="div" className="section-heading">
      <Ui as="div"><Ui as="h2">开源爬虫 · 每日自动采集</Ui><Ui as="p">本机内置 MediaCrawler 爬虫按关键词搜索采集；首次使用需要扫码登录平台账号。</Ui></Ui>
      {status ? <Ui as="button" className="primary-button" type="button" disabled={acting || status.running || !status.installed} onClick={() => void runNow()}>
        {status.running ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
        {status.running ? '正在采集…' : '立即采集'}
      </Ui> : null}
    </Ui>
    {error ? <Ui as="div" className="inline-state error">爬虫状态读取失败:{error}</Ui> : null}
    {status ? <Ui as="div" className="web-sync-body">
      <Ui as="div" className="web-sync-row"><Ui as="span" className="web-sync-label"><Bug size={13} aria-hidden="true" />爬虫安装</Ui>
        <Ui as="strong">{status.installed ? '已就绪' : '未安装'}</Ui></Ui>
      <Ui as="div" className="web-sync-row"><Ui as="span" className="web-sync-label"><QrCode size={13} aria-hidden="true" />平台登录</Ui>
        <Ui as="span" className="crawler-login-group">{(['xhs', 'dy'] as const).map((platform) => (
          <Ui as="span" className="crawler-login-item" key={platform}>
            {status.logged_in[platform]
              ? <Ui as="strong">{platformNames[platform]}已登录</Ui>
              : <Ui as="button" className="text-button" type="button" disabled={acting || !status.installed} onClick={() => void startLogin(platform)}>
                  {platformNames[platform]}扫码登录
                </Ui>}
          </Ui>
        ))}</Ui></Ui>
      <Ui as="div" className="web-sync-row"><Ui as="span" className="web-sync-label"><CalendarClock size={13} aria-hidden="true" />每日自动采集</Ui>
        <Ui as="label" className="check-field"><Ui as="input" type="checkbox" checked={status.schedule.enabled} disabled={acting}
          onChange={() => void saveSchedule({ enabled: !status.schedule.enabled }, status.schedule.enabled ? '已关闭每日自动采集。' : '已开启每日自动采集，到点自动运行。')} />
          每天 {status.schedule.time} 自动运行</Ui></Ui>
      <Ui as="div" className="web-sync-row"><Ui as="span" className="web-sync-label">采集时间</Ui>
        <Ui as="input" aria-label="每日采集时间" type="time" value={timeInput} disabled={acting}
          onChange={(event) => setTimeInput(event.target.value)}
          onBlur={() => { if (timeInput && timeInput !== status.schedule.time) void saveSchedule({ time: timeInput }, '采集时间已保存。') }} /></Ui>
      <Ui as="div" className="web-sync-row"><Ui as="span" className="web-sync-label">关键词</Ui>
        <Ui as="input" aria-label="采集关键词" value={keywordInput} disabled={acting}
          onChange={(event) => setKeywordInput(event.target.value)}
          onBlur={() => {
            const keywords = keywordInput.split(/[,，]/).map((item) => item.trim()).filter(Boolean)
            if (keywords.length && keywords.join('，') !== status.schedule.keywords.join('，')) {
              void saveSchedule({ keywords }, '采集关键词已保存。')
            }
          }} /></Ui>
      <Ui as="div" className="web-sync-row"><Ui as="span" className="web-sync-label">上次采集</Ui>
        {lastResult
          ? <Ui as="span">{formatTime(lastResult.finished_at)} · {platformSummary || '无产出'}{lastResult.error ? ` · 出错：${lastResult.error}` : ''}{lastResult.post_processed ? ` · ${lastResult.post_processed} 帖已进入处理链路` : ''}</Ui>
          : <Ui as="span">尚未运行过</Ui>}
      </Ui>
      {message ? <Ui as="p" className="form-message" role="status">{message}</Ui> : null}
    </Ui> : !error ? <Ui as="div" className="inline-state">正在读取爬虫状态…</Ui> : null}
  </Ui>
}
