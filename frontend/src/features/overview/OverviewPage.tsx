import { Ui } from '../../i18n/Ui';
import { ArrowRight, RefreshCw } from 'lucide-react'
import type { Overview } from '../../lib/types'
import { RepresentativeContent } from './RepresentativeContent'
import { TopicFirstOverview } from './TopicFirstOverview'
import { useState } from 'react'
import { TopicExplorer } from './TopicExplorer'

interface OverviewPageProps {
  data: Overview | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  onOpenPost: (postId: string) => void
  onNewAnalysis: () => void
  onStartCollection: () => void
  onOpenContent: () => void
}

export function OverviewPage(props: OverviewPageProps) {
  const readOnly = (window as Window & { __SOCIALPULSE_ROLE__?: string }).__SOCIALPULSE_ROLE__ === 'viewer'
  const [topic, setTopic] = useState(() => new URLSearchParams(location.search).get('topic') || '')
  const openTopic = (id: string) => { setTopic(id); const url = new URL(location.href); if(id) url.searchParams.set('topic',id); else url.searchParams.delete('topic'); history.replaceState(null,'',url); document.getElementById('topic-explorer')?.scrollIntoView?.({ block: 'start' }) }
  if (props.loading) return <PageState busy title="正在读取最新舆情结果…" />
  if (props.error) return <PageState title="暂时无法读取数据" detail={props.error} action="重新加载" onAction={props.onRefresh} />
  if (!props.data) return <PageState title="还没有可展示的舆情报告" detail="先采集小红书和抖音内容，再手动发起一次 AI 分析。" action="开始采集" onAction={props.onStartCollection} />
  const data = props.data
  return (
    <Ui as="div" className="page overview-page">
      {data.demo && <p role="note">Demonstration dataset · Fictional records</p>}
      <TopicFirstOverview data={data} onEnter={props.onOpenContent} onTopic={openTopic} onOpenPost={props.onOpenPost} />
      <Ui as="div" className="report-meta">
        <Ui as="span">样本 {data.sample_size} 篇</Ui><Ui as="span">{data.comment_count} 条评论</Ui>
        <Ui as="span">小红书 {data.platform_count.xhs}</Ui><Ui as="span">抖音 {data.platform_count.douyin}</Ui>
        <Ui as="button" type="button" onClick={props.onRefresh} aria-label="刷新报告"><RefreshCw size={15} /></Ui>
        {!readOnly ? <Ui as="button" type="button" onClick={props.onNewAnalysis}>生成报告<ArrowRight size={17} /></Ui> : null}
      </Ui>
      <TopicExplorer data={data} topic={topic} onTopic={openTopic} onOpenPost={props.onOpenPost} />
      <RepresentativeContent posts={data.representative_posts} onOpenPost={props.onOpenPost} />
    </Ui>
  )
}

function PageState({ title, detail, action, onAction, busy = false }: { title: string; detail?: string; action?: string; onAction?: () => void; busy?: boolean }) {
  return <Ui as="div" className="page-state">
    {busy
      ? <Ui as="svg" className="state-symbol spinner-svg" viewBox="0 0 50 50" aria-hidden="true"><Ui as="circle" cx="25" cy="25" r="20" pathLength={100} /></Ui>
      : <Ui as="svg" className="state-symbol state-symbol-static" viewBox="0 0 50 50" aria-hidden="true"><Ui as="circle" cx="25" cy="25" r="20" pathLength={100} /><Ui as="circle" className="state-symbol-arc" cx="25" cy="25" r="20" pathLength={100} /></Ui>}
    <Ui as="h1">{title}</Ui>{detail ? <Ui as="p">{detail}</Ui> : null}{action ? <Ui as="button" className="primary-button" onClick={onAction}>{action}</Ui> : null}
  </Ui>
}
