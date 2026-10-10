import { Ui } from '../../i18n/Ui';
import { useCallback, useEffect, useState } from 'react'
import { Database, RefreshCw, Trash2 } from 'lucide-react'
import { apiGet } from '../../lib/api'
import type { PostDetail } from '../../lib/types'
import { usePosts, type PostFilters } from '../../hooks/usePosts'
import { useTimeTree } from '../../hooks/useTimeTree'
import { useDbStats } from '../../hooks/useDbStats'
import { ContentFilters } from './ContentFilters'
import { PostDrawer } from './PostDrawer'
import { PostTable } from './PostTable'
import { TimeTree, type ManagementRange } from './TimeTree'
import { DataManager } from './DataManager'
import { AIAnalysisLauncher } from './AIAnalysisLauncher'

const initialFilters: PostFilters = { platform: '', sentiment: '', query: '', start_date: '', end_date: '' }
function filtersFromLocation(): PostFilters {
  const query = new URLSearchParams(location.search)
  const platform = query.get('content_platform') || ''
  const sentiment = query.get('content_sentiment') || ''
  const date = (key: string) => /^\d{4}-\d{2}-\d{2}$/.test(query.get(key) || '') ? query.get(key)! : ''
  return { ...initialFilters, platform: ['xhs', 'douyin'].includes(platform) ? platform as PostFilters['platform'] : '',
    sentiment: ['positive', 'neutral', 'negative'].includes(sentiment) ? sentiment as PostFilters['sentiment'] : '',
    query: (query.get('content_query') || '').slice(0, 300), start_date: date('content_start_date'), end_date: date('content_end_date') }
}
const emptySelectedIds: string[] = []

function bytesLabel(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function ContentPage({ jobId, initialPostId, onPostClosed, selectionMode = false, initialSelectedIds = emptySelectedIds, onConfirmSelection, onCancelSelection }: {
  jobId?: string
  initialPostId?: string | null
  onPostClosed?: () => void
  selectionMode?: boolean
  initialSelectedIds?: string[]
  onConfirmSelection?: (ids: string[]) => void
  onCancelSelection?: () => void
}) {
  const readOnly = (window as Window & { __SOCIALPULSE_ROLE__?: string }).__SOCIALPULSE_ROLE__ === 'viewer'
  const [filters, setFilters] = useState(filtersFromLocation)
  useEffect(() => {
    const restore = () => setFilters(filtersFromLocation())
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])
  useEffect(() => {
    const url = new URL(location.href)
    for (const [key, value] of Object.entries(filters)) {
      if (value) url.searchParams.set(`content_${key}`, value)
      else url.searchParams.delete(`content_${key}`)
    }
    history.replaceState(null, '', url)
  }, [filters])
  const [revision, setRevision] = useState(0)
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds)
  const [managementRange, setManagementRange] = useState<ManagementRange | null>(null)
  const [manageMode, setManageMode] = useState(false)
  const [statsRevision, setStatsRevision] = useState(0)
  const dbStats = useDbStats(manageMode && !selectionMode, statsRevision)
  const { data, loading, error } = usePosts(jobId, filters, revision)
  const timeTree = useTimeTree(jobId, revision)
  const [timeLabel, setTimeLabel] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(initialPostId || null)
  const [detail, setDetail] = useState<PostDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  useEffect(() => { if (initialPostId) setSelected(initialPostId) }, [initialPostId])
  useEffect(() => { if (selectionMode) setSelectedIds(initialSelectedIds) }, [selectionMode, initialSelectedIds])
  useEffect(() => {
    if (jobId !== 'processed') return
    const refreshWhenDataChanges = () => setRevision((value) => value + 1)
    window.addEventListener('workbench-data-changed', refreshWhenDataChanges)
    return () => window.removeEventListener('workbench-data-changed', refreshWhenDataChanges)
  }, [jobId])
  useEffect(() => {
    if (!selected || !jobId) return
    const controller = new AbortController()
    setDetailLoading(true); setDetailError(null); setDetail(null)
    const path = jobId === 'processed' ? `/api/processed-posts/${selected}` : `/api/posts/${selected}?job_id=${encodeURIComponent(jobId)}`
    apiGet<PostDetail>(path, controller.signal).then(setDetail).catch((reason) => { if (!controller.signal.aborted) setDetailError((reason as Error).message) }).finally(() => { if (!controller.signal.aborted) setDetailLoading(false) })
    return () => controller.abort()
  }, [selected, jobId])
  const close = useCallback(() => { setSelected(null); setDetail(null); onPostClosed?.() }, [onPostClosed])
  const onDeleted = useCallback(() => {
    setSelectedIds([])
    setManagementRange(null)
    setRevision((value) => value + 1)
    setStatsRevision((value) => value + 1)
  }, [])
  const manageStartDate = managementRange?.startDate ?? filters.start_date
  const manageEndDate = managementRange?.endDate ?? filters.end_date
  return <Ui as="div" className={`page content-page${selectionMode ? ' report-picker-page' : ''}`}>
    <Ui as="header" className="page-header"><Ui as="div">{selectionMode ? <Ui as="span" className="eyebrow">报告数据范围</Ui> : null}<Ui as="h1">{selectionMode ? '选择报告帖子' : '内容洞察'}</Ui><Ui as="p">{selectionMode ? '从内容洞察中选择已处理帖子，确认后返回“报告&问答”。' : manageMode ? '管理模式：勾选帖子后可预览并永久删除关联数据，操作不可撤销。' : '查看帖子原文、媒体分析、评论证据与相关主题。'}</Ui></Ui>{selectionMode ? <Ui as="div" className="picker-actions"><Ui as="span">{selectedIds.length} 篇已选</Ui><Ui as="button" className="text-button" type="button" onClick={onCancelSelection}>取消</Ui><Ui as="button" className="primary-button" type="button" disabled={!selectedIds.length} onClick={() => onConfirmSelection?.(selectedIds)}>确认选择</Ui></Ui> : <Ui as="div" className="content-header-actions">{!manageMode && data ? <Ui as="span" className="result-count">{data.total} 篇内容</Ui> : null}{!manageMode ? <Ui as="button" className="text-button" type="button" disabled={loading} onClick={() => setRevision((value) => value + 1)} aria-label="刷新内容洞察"><RefreshCw size={15} />{loading ? '更新中…' : '刷新'}</Ui> : null}{!manageMode && !readOnly ? <AIAnalysisLauncher selectedPostIds={selectedIds} range={managementRange} /> : null}{!manageMode && !readOnly ? <Ui as="button" className="data-manage-button" type="button" onClick={() => setManageMode(true)}><Database size={15} />管理数据</Ui> : null}</Ui>}</Ui>
    {manageMode && !selectionMode ? <Ui as="section" className="manage-bar" aria-label="数据管理">
      <Ui as="div" className="manage-stats">{dbStats.data ? <>
        <Ui as="span" className="manage-chip">帖子 {dbStats.data.posts}</Ui>
        <Ui as="span" className="manage-chip">评论 {dbStats.data.comments}</Ui>
        <Ui as="span" className="manage-chip">媒体文件 {dbStats.data.media_assets}</Ui>
        <Ui as="span" className="manage-chip">安全包 {dbStats.data.safe_packets}</Ui>
        <Ui as="span" className="manage-chip">向量 {dbStats.data.vector_chunks}</Ui>
        <Ui as="span" className="manage-chip">数据库 {bytesLabel(dbStats.data.db_file_bytes)}</Ui>
        <Ui as="span" className="manage-chip">媒体占用 {bytesLabel(dbStats.data.media_dir_bytes)}</Ui>
      </> : <Ui as="span" className="manage-chip">{dbStats.error ?? '正在读取数据库统计…'}</Ui>}</Ui>
      <Ui as="div" className="manage-actions">
        <Ui as="span" className="manage-selected">已选 {selectedIds.length} 篇</Ui>
        <DataManager selectedPostIds={selectedIds} startDate={manageStartDate} endDate={manageEndDate} rangeLabel={managementRange?.label ?? timeLabel ?? undefined} onDeleted={onDeleted} triggerClassName="danger-button manage-delete-button" triggerLabel={<><Trash2 size={15} />{selectedIds.length ? `删除所选 ${selectedIds.length} 篇` : '选择删除范围'}</>} />
        <Ui as="button" className="text-button" type="button" onClick={() => setManageMode(false)}>完成</Ui>
      </Ui>
    </Ui> : null}
    {!jobId ? <Ui as="div" className="inline-state">暂无可查看的分析报告。</Ui> : <Ui as="div" className="content-workspace">{timeTree.data ? <TimeTree data={timeTree.data} selectedLabel={timeLabel} onSelect={(start, end, label) => { setTimeLabel(label); setFilters((current) => ({ ...current, start_date: start, end_date: end })) }} onClear={() => { setTimeLabel(null); setFilters((current) => ({ ...current, start_date: '', end_date: '' })) }} managementRange={managementRange} onManagementRangeChange={setManagementRange} /> : null}<Ui as="div" className="content-results"><ContentFilters value={filters} onChange={setFilters} />{timeTree.error ? <Ui as="div" className="inline-state error">{timeTree.error}</Ui> : null}{loading && !data ? <Ui as="div" className="inline-state">正在筛选…</Ui> : null}{error ? <Ui as="div" className="inline-state error">{error}</Ui> : null}{data ? data.items.length ? <PostTable posts={data.items} onOpen={setSelected} selectedIds={selectedIds} onSelectionChange={setSelectedIds} /> : <Ui as="div" className="inline-state">没有找到符合当前条件的帖子。</Ui> : null}</Ui></Ui>}
    {selected ? <PostDrawer detail={detail} loading={detailLoading} error={detailError} onClose={close} /> : null}
  </Ui>
}
