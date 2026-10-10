import { Ui } from '../../i18n/Ui';
import { Check, CircleAlert, Clock3, KeyRound, LoaderCircle, RotateCcw, Square, Workflow, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { apiPost, apiPut } from '../../lib/api'
import type { PipelineJob, PipelineStage, PipelineStageName, Platform, ProcessingJob } from '../../lib/types'
import { usePollingJobs } from '../../hooks/usePollingJobs'
import { JobHistory } from './JobHistory'
import { OpenCrawlerCard } from './OpenCrawlerCard'
import { WebSyncCard } from './WebSyncCard'
import { useLanguage } from '../../i18n/LanguageContext'

const stages: Array<{ name: PipelineStageName; title: string; note: string }> = [
  { name: 'scope', title: '范围检查', note: '复用已完成日期，定位需要补抓的缺口' },
  { name: 'collection', title: '帖子与评论采集', note: '小红书和抖音独立并行，搜索结果按日期复用并持续保存' },
  { name: 'persistence', title: '媒体下载与持久化', note: '同帖评论采集与媒体下载并行，写入 SQLite 与本地磁盘' },
  { name: 'comments', title: '评论整理', note: '保留原文与表情含义，关联所属帖子和回复上下文' },
  { name: 'analysis', title: '品牌属性与主题分析', note: '先分析帖子，再并行分析评论；仅存疑属性进入审核' },
  { name: 'json', title: '安全 JSON 发布', note: '生成每帖 JSON 与总清单' },
  { name: 'vectors', title: 'Qwen 向量索引', note: '仅为新增或变化内容写入本地向量库' },
  { name: 'publish', title: '内容洞察发布', note: '校验完成后在内容洞察和报告中可用' },
]

function isoDate(offset = 0) {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return date.toISOString().slice(0, 10)
}

function stageIcon(status: string) {
  if (status === 'completed') return <Check size={15} aria-hidden="true" />
  if (status === 'running') return <LoaderCircle size={15} aria-hidden="true" />
  if (status === 'failed') return <CircleAlert size={15} aria-hidden="true" />
  return <Clock3 size={15} aria-hidden="true" />
}

function stageProgress(stage: PipelineStage | undefined, status: string) {
  if (status === 'completed') return 100
  if (!stage?.total_count) return 0
  const terminalCount = stage.completed_count + stage.failed_count
  return Math.min(100, Math.round((terminalCount / stage.total_count) * 100))
}

function elapsedText(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return minutes ? `${minutes}分${remainder}秒` : `${remainder}秒`
}

export function CollectionPipelinePage({ onOpenContent, onOpenReports }: { onOpenContent: () => void; onOpenReports: () => void }) {
  const { language } = useLanguage()
  const { jobs, loading, error, refresh } = usePollingJobs<PipelineJob>('/api/pipeline-jobs')
  const {
    jobs: processingJobs,
    loading: processingLoading,
    error: processingError,
    refresh: refreshProcessing,
  } = usePollingJobs<ProcessingJob>('/api/processing-jobs')
  const active = useMemo(() => jobs.find((job) => ['pending', 'running'].includes(job.status)), [jobs])
  const latest = active || jobs[0]
  const savedReady = Boolean(latest?.live_progress?.posts_saved && latest.live_progress.indexed_posts === latest.live_progress.posts_saved)
  const [keyword, setKeyword] = useState('零食王国')
  const [platforms, setPlatforms] = useState<Platform[]>(['xhs', 'douyin'])
  const [startDate, setStartDate] = useState(isoDate(-6))
  const [endDate, setEndDate] = useState(isoDate())
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [apiKeyDialog, setApiKeyDialog] = useState(false)
  const [tikhubApiKey, setTikhubApiKey] = useState('')
  const [qwenApiKey, setQwenApiKey] = useState('')
  const [apiKeySaving, setApiKeySaving] = useState(false)
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)

  function togglePlatform(platform: Platform) {
    setPlatforms((current) => current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform])
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true); setMessage(null)
    try {
      await apiPost<PipelineJob>('/api/pipeline-jobs', {
        keywords: keyword.split(/[,，]/).map((value) => value.trim()).filter(Boolean),
        platforms, start_date: startDate, end_date: endDate,
      })
      setMessage('流水线已创建，正在自动开始采集与处理。')
      await refresh()
    } catch (reason) { setMessage((reason as Error).message) } finally { setSubmitting(false) }
  }

  async function action(path: string, success: string) {
    setSubmitting(true); setMessage(null)
    try { await apiPost(path); setMessage(success); await refresh() }
    catch (reason) { setMessage((reason as Error).message) } finally { setSubmitting(false) }
  }

  async function processingAction(path: string, success: string) {
    setSubmitting(true); setMessage(null)
    try { await apiPost(path); setMessage(success); await refreshProcessing() }
    catch (reason) { setMessage((reason as Error).message) } finally { setSubmitting(false) }
  }

  async function saveApiKey(event: React.FormEvent) {
    event.preventDefault()
    setApiKeySaving(true); setApiKeyError(null)
    try {
      await apiPut<{ configured: boolean }>('/api/settings/api-key', {
        ...(tikhubApiKey.trim() ? { tikhub_api_key: tikhubApiKey.trim() } : {}),
        ...(qwenApiKey.trim() ? { qwen_api_key: qwenApiKey.trim() } : {}),
      })
      setTikhubApiKey('')
      setQwenApiKey('')
      setApiKeyDialog(false)
      setMessage('API Key 已保存，将用于之后新启动的任务。')
    } catch (reason) { setApiKeyError((reason as Error).message) } finally { setApiKeySaving(false) }
  }

  return <Ui as="div" className="page pipeline-page">
    <Ui as="header" className="page-header">
      <Ui as="div"><Ui as="h1">采集与处理</Ui><Ui as="p">创建一次任务后，系统会自动完成采集、处理、JSON 发布和本地知识库更新。</Ui></Ui>
      <Ui as="button" className="data-manage-button" type="button" onClick={() => setApiKeyDialog(true)}><KeyRound size={15} />API 配置</Ui>
    </Ui>
    {apiKeyDialog ? <Ui as="div" className="data-dialog-layer" role="presentation" onMouseDown={() => setApiKeyDialog(false)}>
      <Ui as="section" className="data-dialog api-key-dialog" role="dialog" aria-modal="true" aria-labelledby="api-key-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <Ui as="header"><Ui as="div"><Ui as="span">本地模型连接</Ui><Ui as="h2" id="api-key-dialog-title">设置 API Key</Ui></Ui><Ui as="button" type="button" aria-label="关闭 API Key 设置" onClick={() => setApiKeyDialog(false)}><X size={18} /></Ui></Ui>
        <Ui as="form" className="data-dialog-body" onSubmit={saveApiKey}>
          <Ui as="p" className="dialog-note">密钥仅写入本机项目的配置文件，不会在网页、接口响应或任务记录中显示。TikHub 用于付费采集，Qwen 用于帖子处理、向量、报告与问答；只填写需要更新的项目即可。</Ui>
          <Ui as="label"><Ui as="span">TikHub API Key</Ui><Ui as="input" aria-label="TikHub API Key" type="password" autoComplete="off" value={tikhubApiKey} minLength={8} onChange={(event) => setTikhubApiKey(event.target.value)} placeholder="用于小红书与抖音采集" /></Ui>
          <Ui as="label"><Ui as="span">Qwen API Key</Ui><Ui as="input" aria-label="Qwen API Key" type="password" autoComplete="off" value={qwenApiKey} minLength={8} onChange={(event) => setQwenApiKey(event.target.value)} placeholder="用于处理、向量、报告与问答" /></Ui>
          {apiKeyError ? <Ui as="p" className="form-message error" role="alert">{apiKeyError}</Ui> : null}
          <Ui as="div" className="dialog-actions"><Ui as="button" className="text-button" type="button" onClick={() => setApiKeyDialog(false)}>取消</Ui><Ui as="button" className="primary-button" type="submit" disabled={apiKeySaving || (tikhubApiKey.trim().length < 8 && qwenApiKey.trim().length < 8)}>{apiKeySaving ? '正在保存…' : '保存 API Key'}</Ui></Ui>
        </Ui>
      </Ui>
    </Ui> : null}
    <Ui as="section" className="pipeline-composer">
      <Ui as="div" className="pipeline-composer-copy"><Workflow size={22} /><Ui as="h2">建立自动流水线</Ui><Ui as="p">双平台并行采集；评论与媒体并行下载；帖子逐篇处理并实时保存。已抓取日期会直接复用。</Ui></Ui>
      <Ui as="form" className="pipeline-form" onSubmit={submit}>
        <Ui as="label"><Ui as="span">关键词</Ui><Ui as="input" aria-label="关键词" value={keyword} required onChange={(event) => setKeyword(event.target.value)} placeholder="多个关键词用逗号分隔" /></Ui>
        <Ui as="fieldset"><Ui as="legend">平台</Ui><Ui as="label" className="check-field"><Ui as="input" type="checkbox" checked={platforms.includes('xhs')} onChange={() => togglePlatform('xhs')} />小红书</Ui><Ui as="label" className="check-field"><Ui as="input" type="checkbox" checked={platforms.includes('douyin')} onChange={() => togglePlatform('douyin')} />抖音</Ui></Ui>
        <Ui as="div" className="form-grid"><Ui as="label"><Ui as="span">开始日期</Ui><Ui as="input" aria-label="开始日期" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></Ui><Ui as="label"><Ui as="span">结束日期</Ui><Ui as="input" aria-label="结束日期" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></Ui></Ui>
        {message ? <Ui as="p" className="form-message" role="status">{message}</Ui> : null}
        <Ui as="button" className="primary-button" type="submit" disabled={submitting || Boolean(active) || platforms.length === 0}>{submitting ? '正在创建…' : active ? '已有流水线运行中' : '开始采集与处理'}</Ui>
      </Ui>
    </Ui>
    <Ui as="section" className="pipeline-status" aria-label="流水线进度">
      <Ui as="div" className="section-heading"><Ui as="div"><Ui as="h2">{latest ? '当前任务进度' : '自动处理步骤'}</Ui><Ui as="p">{latest ? `${latest.keywords.join('、')} · ${latest.start_date} 至 ${latest.end_date}` : '任务启动后会逐阶段持久化进度，可安全中止与恢复。'}</Ui></Ui>{latest?.status === 'completed' ? <Ui as="div" className="pipeline-complete-actions"><Ui as="button" className="text-button" type="button" onClick={onOpenContent}>查看内容洞察</Ui><Ui as="button" className="primary-button" type="button" onClick={onOpenReports}>报告&问答</Ui></Ui> : null}</Ui>
      {latest?.live_progress ? <Ui as="div" className="pipeline-live-progress" aria-live="polite">
        <Ui as="strong">实时采集进度</Ui>
        <div data-native-i18n>
          <p>{language === 'en' ? 'Saved data analysis' : '已保存数据的分析'}：{latest.live_progress.processed_posts || 0} / {latest.live_progress.posts_saved} · {language === 'en' ? 'Ready for Q&A' : '问答已就绪'}：{latest.live_progress.indexed_posts || 0} / {latest.live_progress.posts_saved}</p>
          {latest.status === 'failed' && <p>{language === 'en' ? 'Collection stopped early. Saved posts are retained; processing them does not retry collection or mark missing dates complete.' : '本轮采集提前停止，已保存的数据不会丢失。处理已保存数据不会重新采集，也不会把缺失日期标为完成。'}</p>}
          {savedReady && <button type="button" onClick={onOpenContent}>{language === 'en' ? 'View processed content' : '查看已处理内容'} →</button>}
        </div>
        <Ui as="p">已保存 {latest.live_progress.posts_saved} 篇帖子 · 评论完成 {latest.live_progress.comments_completed} / {latest.live_progress.posts_saved}{latest.live_progress.comments_failed ? ` · ${latest.live_progress.comments_failed} 条评论任务失败` : ''} · 媒体 {latest.live_progress.media_downloaded} 已下载、{latest.live_progress.media_failed} 失败、{latest.live_progress.media_pending} 下载中</Ui>
        <Ui as="p">范围：{latest.live_progress.scope_completed} / {latest.live_progress.scope_total} 日期单元完成 · {latest.live_progress.scope_in_progress} 个正在采集 · {latest.live_progress.scope_partial} 个待补抓</Ui>
        <Ui as="p">当前：{latest.live_progress.current_activity || '正在读取平台数据'} · {['pending', 'running'].includes(latest.status) ? '已运行' : '总耗时'} {elapsedText(latest.live_progress.elapsed_seconds)}</Ui>
      </Ui> : null}
      <Ui as="div" className="pipeline-timeline">{stages.map((definition, index) => {
        let stage = latest?.stages.find((item) => item.name === definition.name)
        const live = latest?.live_progress
        if (live?.posts_saved && stage?.status === 'pending') {
          const verified = definition.name === 'persistence' ? (live.media_pending === 0 && live.media_failed === 0 ? live.media_downloaded : 0)
            : definition.name === 'comments' ? live.comments_completed
            : ['analysis', 'json'].includes(definition.name) ? live.processed_posts || 0
            : ['vectors', 'publish'].includes(definition.name) ? live.indexed_posts || 0 : 0
          const total = definition.name === 'persistence' ? live.media_downloaded + live.media_failed + live.media_pending : live.posts_saved
          if (total > 0 && verified === total) stage = { ...stage, status: 'completed', total_count: total, completed_count: verified, failed_count: 0 }
        }
        const status = stage?.status || 'pending'
        const terminalCount = stage ? stage.completed_count + stage.failed_count : 0
        const counts = stage && stage.total_count
          ? `${terminalCount} / ${stage.total_count} 已处理${stage.failed_count ? ` · ${stage.failed_count} 失败` : ''}`
          : status === 'completed'
            ? '已完成'
            : status === 'running' && terminalCount
              ? `${terminalCount} 篇已处理${stage?.failed_count ? ` · ${stage.failed_count} 失败` : ''} · 总量统计中`
              : status === 'running' ? '正在连接 TikHub' : status === 'failed' ? '采集中断（已保存数据保留）' : '等待执行'
        const progress = stageProgress(stage, status)
        const indeterminate = status === 'running' && !stage?.total_count
        const progressLabel = indeterminate ? `${definition.title}进度 正在处理` : `${definition.title}进度 ${progress}%`
        return <Ui as="article" className={`pipeline-stage ${status}`} key={definition.name}><Ui as="div" className="pipeline-marker">{stageIcon(status)}{index < stages.length - 1 ? <Ui as="i" aria-hidden="true" /> : null}</Ui><Ui as="div"><Ui as="div" className="pipeline-stage-title"><Ui as="strong">{definition.title}</Ui><Ui as="span">{counts}</Ui></Ui><Ui as="div" className="pipeline-stage-progress"><Ui as="div" role="progressbar" aria-label={progressLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={indeterminate ? undefined : progress} aria-valuetext={indeterminate ? '正在处理，等待总量' : undefined} className={indeterminate ? 'indeterminate' : undefined}><Ui as="span" style={indeterminate ? undefined : { width: `${progress}%` }} /></Ui><Ui as="small">{indeterminate ? '处理中' : `${progress}%`}</Ui></Ui><Ui as="p">{stage?.error || definition.note}</Ui></Ui></Ui>
      })}</Ui>
      {latest && ['pending', 'running'].includes(latest.status) ? <Ui as="button" className="danger-button" type="button" disabled={submitting} onClick={() => void action(`/api/pipeline-jobs/${latest.job_id}/cancel`, '任务已安全中止，可稍后继续。')}><Square size={14} />中止任务</Ui> : null}
      {latest && ['failed', 'interrupted'].includes(latest.status) ? <Ui as="button" className="text-button" type="button" disabled={submitting} onClick={() => void action(`/api/pipeline-jobs/${latest.job_id}/retry`, '任务将从失败检查点继续。')}><RotateCcw size={14} />从检查点继续</Ui> : null}
      {latest && ['failed', 'interrupted'].includes(latest.status) && !!latest.live_progress?.posts_saved && !savedReady ? <button data-native-i18n className="primary-button" type="button" disabled={submitting || processingJobs.some(j => ['pending', 'running'].includes(j.status))} onClick={() => void action(`/api/pipeline-jobs/${latest.job_id}/process-saved`, language === 'en' ? 'Processing saved posts only.' : '只处理本轮已保存帖子，不重新采集。')}>{language === 'en' ? 'Process saved data' : '处理已保存数据'}</button> : null}
    </Ui>
    {processingError ? <Ui as="div" className="inline-state error">本地入库记录读取失败：{processingError}</Ui> : null}
    <div data-native-i18n>
      <button type="button" disabled={submitting || !!active || processingJobs.some(j => ['pending', 'running'].includes(j.status))}
        onClick={() => { if (window.confirm(language === 'en' ? 'Reprocess the existing knowledge corpus with the configured model? This uses model API requests. Other collected posts will not be added.' : '使用已配置模型重新处理现有知识库？这会产生模型 API 调用，不会把其他采集帖子混入。')) void processingAction('/api/processing-jobs/backfill', language === 'en' ? 'Knowledge update queued.' : '现有知识库更新已提交。') }}>
        {language === 'en' ? 'Update existing knowledge corpus' : '更新现有知识库'}
      </button>
    </div>
    <OpenCrawlerCard />
    <WebSyncCard />
    {processingLoading ? <Ui as="div" className="inline-state">正在读取本地入库记录…</Ui> : <JobHistory
      title="本地入库记录"
      jobs={processingJobs}
      renderMeta={(job) => <><Ui as="span">{job.completed_posts + job.reused_posts} / {job.total_posts} 篇已就绪</Ui><Ui as="span">{job.failed_posts} 篇失败</Ui></>}
      action={(job) => ['pending', 'running'].includes(job.status)
        ? <Ui as="button" className="danger-button" type="button" disabled={submitting} onClick={() => void processingAction(`/api/processing-jobs/${job.job_id}/cancel`, '本地入库任务已中止。')}><Square size={14} />中止</Ui>
        : ['failed', 'partial'].includes(job.status)
          ? <Ui as="button" className="text-button" type="button" disabled={submitting} onClick={() => void processingAction(`/api/processing-jobs/${job.job_id}/retry`, '失败帖子已重新提交处理。')}><RotateCcw size={14} />重试失败项</Ui>
          : null}
    />}
    {error ? <Ui as="div" className="inline-state error">{error}</Ui> : null}
    {loading ? <Ui as="div" className="inline-state">正在读取流水线任务…</Ui> : null}
  </Ui>
}
