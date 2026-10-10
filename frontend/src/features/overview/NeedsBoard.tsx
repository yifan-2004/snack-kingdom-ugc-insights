import { useEffect, useState } from 'react'
import { apiGet } from '../../lib/api'
import { useLanguage } from '../../i18n/LanguageContext'

type Source = { comment_id: string; post_id: string; platform: string; text: string; post_title: string; likes: number }
type Need = { id: string; kind: string; title: string; title_en: string; count: number; likes: number; score: number; sources: Source[] }
type Board = { items: Need[]; pending_normalization: number }

export function NeedsBoard({ onOpenPost, initialKind = 'question', embedded = false }: { onOpenPost: (id: string) => void; initialKind?: 'question' | 'feedback'; embedded?: boolean }) {
  const { language } = useLanguage(); const en = language === 'en'
  const t = (zh: string, english: string) => en ? english : zh
  const [data, setData] = useState<Board | null>(null)
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  const [kind, updateKind] = useState(() => {
    const saved = new URLSearchParams(location.search).get('needsKind')
    return saved === 'question' || saved === 'feedback' ? saved : initialKind
  })
  const setKind = (value: 'question' | 'feedback') => {
    updateKind(value)
    const url = new URL(location.href)
    url.searchParams.set('needsKind', value)
    history.replaceState(null, '', url)
  }
  const [limit, setLimit] = useState(5)
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) setRevision(n => n + 1) }, 15000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    apiGet<Board>('/api/overview/needs', controller.signal).then(value => {
      if (!controller.signal.aborted) { setData(value); setError(false) }
    }).catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [revision])
  const rows = (data?.items || []).filter(r => r.kind === kind)
  return <section className={`ox needs-board${embedded ? ' needs-board-embedded' : ''}`} data-native-i18n>
    <h2>{t('用户提问与反馈', 'Customer questions & feedback')}</h2>
    <p>{t('热度 = 相似评论数 + 这些评论的点赞总数。仅统计已确认的品牌相关评论，不代表官方答复。', 'Score = similar comments + their total likes. Confirmed brand-related comments only; these are not official answers.')}</p>
    <div className="ox-tabs">{([['question', '用户提问', 'Questions'], ['feedback', '用户反馈', 'Feedback']] as const).map(([value, zh, eng]) => <button key={value} aria-pressed={kind === value} onClick={() => { setKind(value); setLimit(5) }}>{t(zh, eng)}</button>)}</div>
    {kind === 'feedback' && <small>{t('以下是用户观点的归纳，未经独立事实核实。', 'Summaries of user opinions, not independently verified facts.')}</small>}
    {error && <p role="alert">{t('榜单更新失败', 'Could not update rankings')} <button onClick={() => setRevision(n => n + 1)}>{t('重试', 'Retry')}</button></p>}
    {!data && !error && <p role="status">{t('正在整理榜单…', 'Loading rankings…')}</p>}
    {!!data?.pending_normalization && <small>{t('部分新问题尚未完成同义归并，暂单独展示；更新知识库后会重试。', 'Some new signals are shown separately until semantic grouping completes. Refresh the knowledge base to retry.')}</small>}
    {data && !rows.length && <p>{t('暂无符合条件的评论', 'No eligible comments yet')}</p>}
    {rows.slice(0, limit).map((row, index) => <NeedCard key={row.id} row={row} index={index} en={en} onOpenPost={onOpenPost} />)}
    {rows.length > limit && <button onClick={() => setLimit(n => n + 5)}>{t('查看更多', 'Show more')}</button>}
  </section>
}

function NeedCard({ row, index, en, onOpenPost }: { row: Need; index: number; en: boolean; onOpenPost: (id: string) => void }) {
  const [limit, setLimit] = useState(10)
  return <details className="need-card"><summary><span className="need-order">{index + 1}</span><strong>{en ? row.title_en : row.title}</strong><span>{en ? 'Score' : '热度'} {row.score}</span><small>{row.count} {en ? 'comments' : '条评论'} · ♥ {row.likes}</small></summary>
    <div className="ox-sources">{row.sources.slice(0, limit).map(s => <article key={`${s.platform}:${s.post_id}:${s.comment_id}`}><small data-original>{s.post_title}</small><p data-original>{s.text}</p><footer><span>♥ {s.likes}</span><button onClick={() => onOpenPost(s.post_id)}>{en ? 'Open post & context' : '查看原帖与上下文'} →</button></footer></article>)}</div>
    {row.sources.length > limit && <button onClick={() => setLimit(n => n + 10)}>{en ? 'More comments' : '更多评论'}</button>}
  </details>
}
