import { Ui } from '../../i18n/Ui';
import { ExternalLink, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { PostDetail } from '../../lib/types'
import { apiGet } from '../../lib/api'
import { useTextLanguage } from '../../i18n/LanguageContext'

const sentimentLabel = { positive: '正面', neutral: '中性', negative: '负面' }
const opinionKindLabel = { opinion: '意见', mixed_opinion: '褒贬混合', inquiry: '询问', factual: '事实信息', social: '社交互动', off_topic: '离题' }

export function PostDrawer({ detail, loading, error, onClose }: { detail: PostDetail | null; loading: boolean; error: string | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [packet, setPacket] = useState<any | null>(null)
  const [packetError, setPacketError] = useState<string | null>(null)
  const [packetLoading, setPacketLoading] = useState(false)
  const requestRef = useRef<AbortController | null>(null)
  useEffect(() => {
    requestRef.current?.abort()
    setPacket(null); setPacketError(null); setPacketLoading(false)
    return () => requestRef.current?.abort()
  }, [detail?.post_id])
  useEffect(() => {
    closeRef.current?.focus()
    const listener = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  }, [onClose])
  async function openPacket() {
    if (!detail || packetLoading) return
    const controller = new AbortController()
    requestRef.current = controller
    setPacketError(null); setPacketLoading(true)
    try {
      const response = await apiGet<{ packet: any }>(`/api/processed-posts/${detail.post_id}/packet`, controller.signal)
      if (!controller.signal.aborted) setPacket(response.packet)
    } catch (reason) {
      if (!controller.signal.aborted) setPacketError((reason as Error).message)
    } finally {
      if (!controller.signal.aborted) setPacketLoading(false)
    }
  }
  return (
    <Ui as="div" className="drawer-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <Ui as="aside" className="post-drawer" role="dialog" aria-modal="true" aria-label="帖子详情">
        <Ui as="div" className="drawer-header"><Ui as="span">{detail?.platform === 'douyin' ? '抖音视频' : '小红书帖子'}</Ui><Ui as="button" ref={closeRef} type="button" onClick={onClose} aria-label="关闭详情"><X size={19} /></Ui></Ui>
        {loading ? <Ui as="div" className="drawer-state"><Ui as="span" className="skeleton" style={{ width: '34%' }} /><Ui as="span" className="skeleton" style={{ width: '88%' }} /><Ui as="span" className="skeleton" style={{ width: '61%' }} />正在加载完整证据…</Ui> : null}
        {error ? <Ui as="div" className="drawer-state error">{error}</Ui> : null}
        {detail ? <Ui as="div" className="drawer-content">
          <Ui as="div" className="drawer-title"><Ui as="span" className={`sentiment-text ${detail.overall_label}`}>{sentimentLabel[detail.overall_label]}</Ui><Ui as="h2">{detail.title ? <Ui as="span" data-original>{detail.title}</Ui> : '未命名内容'}</Ui><Ui as="p">{detail.author.nickname} · {new Date(detail.published_at).toLocaleString()}</Ui><Ui as="a" className="external-link" href={detail.canonical_url} target="_blank" rel="noreferrer">打开原帖<ExternalLink size={15} /></Ui></Ui>
          <Ui as="section"><Ui as="h3">帖子正文</Ui><Ui as="p" className="source-copy">{detail.body_text ? <Ui as="span" data-original>{detail.body_text}</Ui> : '未提供文字正文'}</Ui></Ui>
          {detail.media.length ? <Ui as="section"><Ui as="h3">原帖媒体</Ui><Ui as="p" className="source-copy">图片与视频会生成整段媒体描述，作为这篇帖子的运营标签与检索依据。</Ui><Ui as="div" className="media-evidence">{detail.media.map((media) => <Ui as="article" key={media.media_id}>{media.local_url && media.media_type === 'video' ? <Ui as="video" controls preload="metadata" src={media.local_url} /> : null}{media.local_url && media.media_type !== 'video' ? <Ui as="img" loading="lazy" src={media.local_url} alt="帖子媒体" /> : null}<Ui as="strong">{media.media_type === 'video' ? '原帖视频' : '原帖图片'}</Ui>{media.local_url ? null : <Ui as="p">媒体仅保留来源记录，尚未下载。</Ui>}{media.extracted_text ? <Ui as="p" data-original className="source-copy">{media.extracted_text}</Ui> : null}</Ui>)}</Ui></Ui> : null}
          <Ui as="section"><Ui as="div" className="comment-heading"><Ui as="h3">帖子结论</Ui><Ui as="button" className="text-button" type="button" disabled={packetLoading} onClick={() => void openPacket()}>{packetLoading ? '正在加载…' : '查看知识记录'}</Ui></Ui><Ui as="p" data-original className="source-copy">{detail.summary}</Ui>{detail.problems.length ? <Ui as="ul" className="compact-list">{detail.problems.map((item) => <Ui as="li" key={item}>{item}</Ui>)}</Ui> : null}</Ui>
          {packetError ? <Ui as="p" role="alert" className="form-message">{packetError}</Ui> : null}
          {packet ? <KnowledgePacketView packet={packet} /> : null}
          {!packet?.knowledge ? <Ui as="section">
            <Ui as="h3">评论证据</Ui>
            <Ui as="p" className="source-copy">此处展示当前已处理的评论；完整原文与属性可在知识记录中查看。</Ui>
            <Ui as="div" className="comment-list">{detail.comments.map(comment => <Ui as="article" key={comment.comment_id}>
              <Ui as="div"><Ui as="strong" data-original>{comment.author_nickname || '匿名用户'}</Ui>
                {comment.label ? <Ui as="span" className={`sentiment-text ${comment.label}`}>{sentimentLabel[comment.label]}</Ui> : <Ui as="span">{opinionKindLabel[comment.opinion_kind]}</Ui>}
              </Ui>
              <Ui as="p" data-original>{comment.content}</Ui>
              {comment.reason ? <Ui as="p" data-original>{comment.reason}</Ui> : null}
            </Ui>)}</Ui>
          </Ui> : null}
        </Ui> : null}
      </Ui>
    </Ui>
  )
}

function KnowledgePacketView({ packet }: { packet: any }) {
  const en = useTextLanguage() === 'en'
  return <section data-native-i18n className="knowledge-record">
    <h3>{en ? 'Source-preserving knowledge JSON' : '保留原文的知识 JSON'}</h3>
    <p>{en ? 'Original sources are read-only. Only uncertain comment attributes need review.' : '原始资料只读，仅存疑的评论属性需要审核。'}</p>
    <p>{en ? 'Last updated: ' : '最近更新：'}{packet.metadata?.last_updated_at || packet.metadata?.generated_at || '—'}</p>
    {packet.knowledge ? <details open><summary>{en ? 'All comments and attributes' : '全部评论与属性'}</summary>
      {packet.knowledge.comments.map((row: any) => <article key={row.comment_id}>
        <p>{row.raw_text}</p>
        <p>{row.attributes?.description}</p>
        <small>{en ? 'Comment ID: ' : '评论 ID：'}{row.comment_id}</small>
        <p>{attributeLabel(row.attributes?.relevance, en)} · {attributeLabel(row.attributes?.target, en)} · {attributeLabel(row.attributes?.sentiment, en)} · {attributeLabel(row.review_status, en)}</p>
        {(row.semantic?.is_question ?? row.attributes?.intent === 'inquiry') && <small>{en ? 'Customer question' : '用户提问'}</small>}
        {row.semantic?.matches?.length > 0 && <p>{en ? 'Topic evidence: ' : '主题依据：'}{row.semantic.matches.map((m: any) => m.evidence).join(' · ')}</p>}
      </article>)}
    </details> : <p>{en ? 'This record predates contextual comment analysis. Update the knowledge base in Collect & Process to view all comment attributes.' : '此记录尚未完成上下文分析。请在“采集与处理”更新现有知识库，再查看完整评论属性。'}</p>}
    <details><summary>{en ? 'View complete JSON' : '查看完整 JSON'}</summary><pre>{JSON.stringify(packet, null, 2)}</pre></details>
  </section>
}

function attributeLabel(value: string | undefined, en: boolean) {
  const labels: Record<string, [string, string]> = {
    related: ['品牌相关', 'Brand-related'], unrelated: ['品牌无关', 'Unrelated to brand'],
    uncertain: ['相关性待确认', 'Relevance uncertain'], brand: ['零食王国', 'Snack Kingdom'],
    blogger: ['博主', 'Creator'], other: ['其他对象', 'Other target'], unclear: ['对象待确认', 'Target unclear'],
    positive: ['正向', 'Positive'], neutral: ['中性', 'Neutral'], negative: ['负向', 'Negative'], mixed: ['褒贬混合', 'Mixed'],
    needs_review: ['待审核', 'Needs review'], auto_accepted: ['自动确认', 'Automatically accepted'],
    human_confirmed: ['人工确认', 'Human confirmed'], accepted: ['已确认', 'Accepted'],
  }
  return value && labels[value] ? labels[value][en ? 1 : 0] : (en ? 'Not assessed' : '未判定')
}
