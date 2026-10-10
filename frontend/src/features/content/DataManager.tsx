import { Ui } from '../../i18n/Ui';
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Database, Trash2, X } from 'lucide-react'
import { apiGet, apiPost } from '../../lib/api'
import type { CollectionJob, DeletionPreview, DeletionResult } from '../../lib/types'

type Scope = 'posts' | 'date_range' | 'collection_job'

function bytesLabel(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export function DataManager({ selectedPostIds, startDate, endDate, rangeLabel, onDeleted, triggerLabel, triggerClassName }: {
  selectedPostIds: string[]
  startDate: string
  endDate: string
  rangeLabel?: string
  onDeleted: (result: DeletionResult) => void
  triggerLabel?: ReactNode
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [jobs, setJobs] = useState<CollectionJob[]>([])
  const [jobId, setJobId] = useState('')
  const [scope, setScope] = useState<Scope>(selectedPostIds.length ? 'posts' : 'collection_job')
  const [rangeStart, setRangeStart] = useState(startDate)
  const [rangeEnd, setRangeEnd] = useState(endDate)
  const [preview, setPreview] = useState<DeletionPreview | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    apiGet<CollectionJob[]>('/api/collection-jobs')
      .then((rows) => {
        const removable = rows.filter((row) => !['pending', 'running'].includes(row.status))
        setJobs(removable)
        setJobId((current) => current || removable[0]?.job_id || '')
      })
      .catch((reason) => setError((reason as Error).message))
  }, [open])

  const canPreview = useMemo(() => Boolean(jobId) && (
    scope === 'collection_job'
    || (scope === 'posts' && selectedPostIds.length > 0)
    || (scope === 'date_range' && rangeStart && rangeEnd)
  ), [jobId, scope, selectedPostIds.length, rangeStart, rangeEnd])

  function close() {
    if (busy) return
    setOpen(false); setPreview(null); setConfirmed(false); setConfirmation(''); setError(null)
  }

  function openManager() {
    setScope(selectedPostIds.length ? 'posts' : (startDate && endDate ? 'date_range' : 'collection_job'))
    setRangeStart(startDate); setRangeEnd(endDate); setPreview(null); setError(null); setOpen(true)
  }

  async function loadPreview() {
    setBusy(true); setError(null); setPreview(null); setConfirmed(false); setConfirmation('')
    try {
      setPreview(await apiPost<DeletionPreview>('/api/deletions/preview', {
        scope, collection_job_id: jobId,
        post_ids: scope === 'posts' ? selectedPostIds : [],
        start_date: scope === 'date_range' ? rangeStart : null,
        end_date: scope === 'date_range' ? rangeEnd : null,
      }))
    } catch (reason) { setError((reason as Error).message) }
    finally { setBusy(false) }
  }

  async function execute() {
    if (!preview) return
    setBusy(true); setError(null)
    try {
      const result = await apiPost<DeletionResult>('/api/deletions/execute', {
        token: preview.token, confirmation_text: confirmation,
      })
      onDeleted(result)
      setBusy(false); setOpen(false); setPreview(null); setConfirmed(false); setConfirmation('')
    } catch (reason) { setError((reason as Error).message); setBusy(false) }
  }

  return <>
    <Ui as="button" className={triggerClassName ?? 'data-manage-button'} type="button" onClick={openManager}>{triggerLabel ?? <><Database size={15} />管理数据</>}</Ui>
    {open ? <Ui as="div" className="data-dialog-layer" role="presentation">
      <Ui as="section" className="data-dialog" role="dialog" aria-modal="true" aria-labelledby="data-dialog-title">
        <Ui as="header"><Ui as="div"><Ui as="span">DATA CONTROL</Ui><Ui as="h2" id="data-dialog-title">管理采集数据</Ui></Ui><Ui as="button" type="button" aria-label="关闭" onClick={close}><X size={19} /></Ui></Ui>
        <Ui as="div" className="data-dialog-body">
          <Ui as="p" className="dialog-note">先预览影响范围。只有不再被其他采集任务引用的帖子，才会连同评论、媒体和分析结果永久删除。</Ui>
          {rangeLabel ? <Ui as="p" className="dialog-range">待管理范围：{rangeLabel}</Ui> : null}
          <Ui as="label"><Ui as="span">采集任务</Ui><Ui as="select" value={jobId} onChange={(event) => { setJobId(event.target.value); setPreview(null) }}><Ui as="option" value="">请选择</Ui>{jobs.map((job) => <Ui as="option" key={job.job_id} value={job.job_id}>{job.keywords.join('、')} · {job.start_date}—{job.end_date} · {job.post_count}篇</Ui>)}</Ui></Ui>
          <Ui as="fieldset" className="scope-options"><Ui as="legend">删除范围</Ui>
            <Ui as="label"><Ui as="input" type="radio" name="scope" checked={scope === 'posts'} onChange={() => { setScope('posts'); setPreview(null) }} disabled={!selectedPostIds.length} /><Ui as="span">已选帖子<Ui as="small">{selectedPostIds.length} 篇</Ui></Ui></Ui>
            <Ui as="label"><Ui as="input" type="radio" name="scope" checked={scope === 'date_range'} onChange={() => { setScope('date_range'); setPreview(null) }} /><Ui as="span">日期范围<Ui as="small">按发布时间</Ui></Ui></Ui>
            <Ui as="label"><Ui as="input" type="radio" name="scope" checked={scope === 'collection_job'} onChange={() => { setScope('collection_job'); setPreview(null) }} /><Ui as="span">整个采集任务<Ui as="small">解除全部关联</Ui></Ui></Ui>
          </Ui>
          {scope === 'date_range' ? <Ui as="div" className="deletion-dates"><Ui as="label"><Ui as="span">开始日期</Ui><Ui as="input" type="date" value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} /></Ui><Ui as="label"><Ui as="span">结束日期</Ui><Ui as="input" type="date" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} /></Ui></Ui> : null}
          {!preview ? <Ui as="button" className="primary-button" type="button" disabled={!canPreview || busy} onClick={loadPreview}>{busy ? '正在计算…' : '预览影响范围'}</Ui> : <Ui as="div" className="deletion-preview">
            <Ui as="div" className="impact-title"><Trash2 size={18} /><Ui as="div"><Ui as="strong">将永久删除 {preview.counts.posts_to_delete} 篇帖子</Ui><Ui as="span">另有 {preview.counts.shared_posts} 篇被其他任务引用，将安全保留</Ui></Ui></Ui>
            <Ui as="dl"><Ui as="div"><Ui as="dt">原始评论</Ui><Ui as="dd">{preview.counts.comments}</Ui></Ui><Ui as="div"><Ui as="dt">媒体文件</Ui><Ui as="dd">{preview.counts.media}</Ui></Ui><Ui as="div"><Ui as="dt">分析结果</Ui><Ui as="dd">{preview.counts.analyses}</Ui></Ui><Ui as="div"><Ui as="dt">释放空间</Ui><Ui as="dd">{bytesLabel(preview.counts.disk_bytes)}</Ui></Ui></Ui>
            <Ui as="label" className="irreversible-check"><Ui as="input" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />我理解此操作不可撤销</Ui>
            <Ui as="label"><Ui as="span">输入确认文字</Ui><Ui as="input" aria-label="输入确认文字" value={confirmation} placeholder={preview.confirmation_text} onChange={(event) => setConfirmation(event.target.value)} /></Ui>
            <Ui as="div" className="dialog-actions"><Ui as="button" className="text-button" type="button" onClick={() => setPreview(null)}>返回修改</Ui><Ui as="button" className="danger-button" type="button" disabled={busy || !confirmed || confirmation !== preview.confirmation_text} onClick={execute}>{busy ? '正在删除…' : '永久删除'}</Ui></Ui>
          </Ui>}
          {error ? <Ui as="p" className="form-message error">{error}</Ui> : null}
        </Ui>
      </Ui>
    </Ui> : null}
  </>
}
