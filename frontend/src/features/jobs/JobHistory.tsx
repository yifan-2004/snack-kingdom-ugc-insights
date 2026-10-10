import { Ui } from '../../i18n/Ui';
import { CheckCircle2, CircleAlert, Clock3, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'

const statusText: Record<string, string> = {
  pending: '等待开始', running: '正在运行', completed: '已完成',
  completed_with_warnings: '已完成，有部分警告', failed: '失败', interrupted: '已中断', partial: '部分完成',
}

export function JobHistory<T extends { job_id: string; status: string; created_at: string; last_event: string | null; progress?: number }>({ title, jobs, renderMeta, action }: { title: string; jobs: T[]; renderMeta: (job: T) => ReactNode; action?: (job: T) => ReactNode }) {
  return <Ui as="section" className="job-history"><Ui as="div" className="section-heading"><Ui as="div"><Ui as="h2">{title}</Ui><Ui as="p">最新 30 条本地任务记录</Ui></Ui></Ui>{jobs.length ? <Ui as="div" className="job-list">{jobs.map((job) => <Ui as="article" className="job-row" key={job.job_id}><StatusIcon status={job.status} /><Ui as="div" className="job-main"><Ui as="div"><Ui as="strong">{statusText[job.status] || job.status}</Ui><Ui as="span">{new Date(job.created_at).toLocaleString('zh-CN')}</Ui></Ui><Ui as="p">{job.last_event || '任务已创建，等待更新'}</Ui>{['pending', 'running'].includes(job.status) && typeof job.progress === 'number' ? <Ui as="div" className="job-progress"><Ui as="div" role="progressbar" aria-label={`任务进度 ${job.progress}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.progress}><Ui as="span" style={{ width: `${job.progress}%` }} /></Ui><Ui as="small">{job.progress}%</Ui></Ui> : null}<Ui as="div" className="job-meta">{renderMeta(job)}</Ui></Ui>{action?.(job)}</Ui>)}</Ui> : <Ui as="div" className="inline-state">还没有任务记录。</Ui>}</Ui>
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'running') return <LoaderCircle className="status-icon running" size={20} />
  if (status === 'completed' || status === 'completed_with_warnings') return <CheckCircle2 className="status-icon completed" size={20} />
  if (status === 'failed') return <CircleAlert className="status-icon failed" size={20} />
  return <Clock3 className="status-icon" size={20} />
}
