import { Ui } from '../../i18n/Ui';
import { Download, Sparkles, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { apiPost } from '../../lib/api'
import { saveLatestReportAsDocument } from '../../lib/reportExport'
import type { ReportPreview, ReportSelection } from '../../lib/types'
import type { ManagementRange } from './TimeTree'

export function AIAnalysisLauncher({ selectedPostIds, range }: { selectedPostIds: string[]; range: ManagementRange | null }) {
  const [preview, setPreview] = useState<ReportPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [reportCreated, setReportCreated] = useState(false)
  const [savingDoc, setSavingDoc] = useState(false)
  const selection = useMemo<ReportSelection | null>(() => {
    if (selectedPostIds.length) return { post_ids: selectedPostIds, label: `已选 ${selectedPostIds.length} 篇帖子` }
    if (range) return { start_date: range.startDate, end_date: range.endDate, label: range.label }
    return null
  }, [selectedPostIds, range])
  async function openPreview() {
    if (!selection) return
    setLoading(true); setMessage(null)
    try { setPreview(await apiPost<ReportPreview>('/api/reports/preview', selection)) }
    catch (reason) { setMessage((reason as Error).message) }
    finally { setLoading(false) }
  }
  async function createReport() {
    if (!preview) return
    setLoading(true); setMessage(null)
    try { await apiPost('/api/reports', preview.selection); setMessage('报告任务已创建'); setReportCreated(true) }
    catch (reason) { setMessage((reason as Error).message) }
    finally { setLoading(false) }
  }
  async function saveLatestDoc() {
    setSavingDoc(true); setMessage(null)
    try { setMessage(`已保存到本地 data/reports/ 并开始下载：${await saveLatestReportAsDocument()}`) }
    catch (reason) { setMessage((reason as Error).message) }
    finally { setSavingDoc(false) }
  }
  return <>
    <Ui as="button" className="ai-analysis-button" type="button" disabled={!selection || loading} onClick={() => void openPreview()}><Sparkles size={15} />{loading && !preview ? '检查中…' : 'AI 分析'}</Ui>
    {reportCreated && !preview ? <Ui as="button" className="text-button save-doc-button" type="button" disabled={savingDoc} onClick={() => void saveLatestDoc()}><Download size={14} />{savingDoc ? '导出中…' : '保存为文档'}</Ui> : null}
    {message && !preview ? <Ui as="span" className="form-message" role="status">{message}</Ui> : null}
    {preview ? <Ui as="div" className="data-dialog-layer" role="presentation"><Ui as="section" className="data-dialog" role="dialog" aria-modal="true" aria-labelledby="analysis-preview-title"><Ui as="header"><Ui as="div"><Ui as="span">AI REPORT</Ui><Ui as="h2" id="analysis-preview-title">生成分析报告</Ui></Ui><Ui as="button" type="button" aria-label="关闭" onClick={() => { setPreview(null); setMessage(null) }}><X size={18} /></Ui></Ui><Ui as="div" className="data-dialog-body analysis-preview"><Ui as="p" className="analysis-scope">{preview.selection.label}</Ui><Ui as="strong">可分析 {preview.available_posts} 篇，未就绪 {preview.unavailable_posts} 篇</Ui><Ui as="p" className="dialog-note">报告只读取采集后已清洗的帖子 JSON、主要评论与统计结果，不会临时重新处理原始媒体。</Ui>{message ? <Ui as="p" className="form-message" role="status">{message}</Ui> : null}<Ui as="div" className="dialog-actions"><Ui as="button" className="text-button" type="button" onClick={() => setPreview(null)}>取消</Ui><Ui as="button" className="primary-button" type="button" disabled={loading || preview.available_posts === 0} onClick={() => void createReport()}>{loading ? '生成中…' : '生成报告'}</Ui></Ui></Ui></Ui></Ui> : null}
  </>
}
