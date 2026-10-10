import { useEffect, useState } from 'react'
import { apiGet } from '../../lib/api'
import { useLanguage } from '../../i18n/LanguageContext'
import type { Overview } from '../../lib/types'
import './overview-explorer.css'

type Evidence = { id: string; post_id: string; kind: string; text: string; title: string; date: string | null; likes: number; sentiment: string | null; is_question?: boolean; topic_evidence?: string }
type Point = { id: string; name: string; name_en: string; mentions: number; likes: number; negative_ratio: number | null }
type Row = { date: string; topic_id: string; mentions: number; positive: number; negative: number; neutral: number; mixed: number }
type Explorer = { items: Evidence[]; total: number; sentiment_counts: Record<string, number>; scatter: Point[]; timeline: Row[]; missing_dates: number; new_posts_pending: number; new_comments_pending: number; collected_posts: number; collected_comments: number; updated_at: string }

export function TopicExplorer({ data, topic, onTopic, onOpenPost }: { data: Overview; topic: string; onTopic: (id: string) => void; onOpenPost: (id: string) => void }) {
  const { language } = useLanguage(); const en = language === 'en'; const t = (zh: string, eng: string) => en ? eng : zh
  const [result, setResult] = useState<Explorer | null>(null)
  const [period, setPeriod] = useState('week'); const [kind, setKind] = useState('comment'); const [offset, setOffset] = useState(0)
  const [start, setStart] = useState(''); const [end, setEnd] = useState(''); const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  const [sentiment, setSentiment] = useState('all')
  const [questionOnly, setQuestionOnly] = useState(false)
  const filters = [['all', '全部', 'All'], ['positive', '正向', 'Positive'], ['negative', '负向', 'Negative'], ['neutral', '中性', 'Neutral'], ['mixed', '褒贬并存', 'Mixed'], ['non_opinion', '非评价', 'Non-opinion']]
  useEffect(() => { setResult(null) }, [topic, kind, start, end, period, sentiment, questionOnly])
  useEffect(() => { setOffset(0) }, [topic, kind, start, end, sentiment, questionOnly])
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) setRevision(n => n + 1) }, 15000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ period, kind, offset: String(offset), limit: '20' })
    if (topic) params.set('topic', topic)
    if (kind === 'comment' && sentiment !== 'all') params.set('sentiment', sentiment)
    if (kind === 'comment' && questionOnly) params.set('question_only', 'true')
    if (start) params.set('start', start)
    if (end) params.set('end', end)
    setError(false)
    apiGet<Explorer>(`/api/overview/explorer?${params}`, controller.signal).then(value => { if (!controller.signal.aborted) setResult(value) }).catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [topic, period, kind, sentiment, questionOnly, offset, start, end, revision, data.completed_at, data.comment_count])
  return <section className="ox" data-native-i18n id="topic-explorer">
    <header><div><h2>{t('主题详情', 'Explore topics')}</h2><p>{t('点击主题查看原始帖子与评论。', 'Choose a topic to inspect its posts and comments.')}</p></div>
      <select aria-label={t('选择主题', 'Choose topic')} value={topic} onChange={e => onTopic(e.target.value)}><option value="">{t('全部主题', 'All topics')}</option>{data.topics.map(q => <option key={q.id} value={q.id}>{en ? q.name_en : q.name}</option>)}</select></header>
    <div className="ox-controls"><label>{t('开始日期', 'From')}<input type="date" value={start} max={end || undefined} onChange={e => setStart(e.target.value)} /></label><label>{t('结束日期', 'To')}<input type="date" value={end} min={start || undefined} onChange={e => setEnd(e.target.value)} /></label><button onClick={() => { setStart(''); setEnd('') }}>{t('全部时间', 'All dates')}</button></div>
    {error && <p role="alert">{t('未能刷新主题数据，当前显示的是上次结果。请检查日期范围后重试。', 'Could not refresh topics. The previous result is shown. Check the date range and retry.')} <button onClick={() => setRevision(n => n + 1)}>{t('重试', 'Retry')}</button></p>}
    {result && <p>{t('已采集', 'Collected')} {result.collected_posts} {t('篇帖子', 'posts')} · {result.collected_comments} {t('条评论', 'comments')} · {t('分析更新', 'Analysis updated')} {new Date(result.updated_at).toLocaleString(en ? 'en-US' : 'zh-CN')}</p>}
    {!!result && (!!result.new_posts_pending || !!result.new_comments_pending) && <p role="status">{result.new_posts_pending} {t('篇新帖子、', 'new posts, ')}{result.new_comments_pending} {t('条新增评论待分析；图表暂不纳入未分析数据。', 'new comments await analysis and are not yet included in charts.')}</p>}
    {topic && <div className="ox-evidence"><div className="ox-tabs"><button aria-pressed={kind === 'comment'} onClick={() => setKind('comment')}>{t('相关评论', 'Comments')}</button><button aria-pressed={kind === 'post'} onClick={() => setKind('post')}>{t('相关帖子', 'Posts')}</button><span>{result?.total ?? '—'} {t('条', 'sources')}</span></div>
      {kind === 'comment' && <div className="ox-sentiment" role="group" aria-label={t('评论情感筛选', 'Filter comment sentiment')}>
        {filters.map(([value, zh, eng]) => <button key={value} aria-pressed={sentiment === value} onClick={() => { setSentiment(value); setOffset(0) }}>{t(zh, eng)} <span>{result ? result.sentiment_counts?.[value] ?? 0 : '—'}</span></button>)}
        <small>{t('仅筛选评论列表', 'Filters comments only')}</small>
        <label><input type="checkbox" checked={questionOnly} onChange={e => { setQuestionOnly(e.target.checked); setOffset(0) }} />{t('只看用户提问', 'Questions only')}</label>
      </div>}
      <div className="ox-sources">{result?.items.map(r => <article key={`${r.kind}:${r.post_id}:${r.id}`}><small data-original>{r.title}</small><p data-original>{r.text}</p>{r.topic_evidence && <small>{t('主题依据：', 'Topic evidence: ')}<q data-original>{r.topic_evidence}</q></small>}<footer><span>{r.date || t('日期未知', 'Unknown date')} · ♥ {r.likes} · {r.kind === 'post' ? t('原帖','Post') : r.sentiment === 'positive' ? t('正向','Positive') : r.sentiment === 'negative' ? t('负向','Negative') : r.sentiment === 'neutral' ? t('中性','Neutral') : r.sentiment === 'mixed' ? t('褒贬并存','Mixed') : t('非评价','Non-opinion')}{r.is_question ? t(' · 用户提问', ' · Question') : ''}</span><button onClick={() => onOpenPost(r.post_id)}>{t('查看原帖与上下文', 'Open post & context')} →</button></footer></article>)}</div>
      {result && !result.items.length && <p>{t('此范围没有已确认的相关内容。', 'No confirmed related sources in this range.')}</p>}
      <nav><button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>{t('上一页', 'Previous')}</button><span>{Math.floor(offset / 20) + 1}</span><button disabled={!result || offset + 20 >= result.total} onClick={() => setOffset(offset + 20)}>{t('下一页', 'Next')}</button></nav>
    </div>}
    <details className="ox-charts" open><summary>{t('辅助视图', 'Charts')}</summary><div className="ox-controls"><select aria-label={t('时间粒度', 'Time grouping')} value={period} onChange={e => setPeriod(e.target.value)}><option value="day">{t('按日', 'Daily')}</option><option value="week">{t('按周', 'Weekly')}</option><option value="month">{t('按月', 'Monthly')}</option></select><small>{t('按发布时间 · 帖子与评论各计一次；情感线仅统计已确认的品牌评价。', 'Publication dates · each source counts once; sentiment lines use confirmed brand opinions only.')}</small></div>
      {result && <div className="ox-chart-grid"><LineChart rows={result.timeline} sentiment={false} en={en} /><LineChart rows={result.timeline} sentiment en={en} /><Scatter points={result.scatter} en={en} onTopic={onTopic} /></div>}
      {!!result?.missing_dates && <small>{result.missing_dates} {t('条主题来源缺少日期，未计入折线图。', 'topic sources lack dates and are excluded from time-series charts.')}</small>}
    </details>
  </section>
}

function LineChart({ rows, sentiment, en }: { rows: Row[]; sentiment: boolean; en: boolean }) {
  const grouped = new Map<string, number[]>()
  for (const r of rows) { const values = grouped.get(r.date) || [0, 0, 0, 0]; [r.mentions, r.positive, r.negative, r.neutral].forEach((v, i) => values[i] += v || 0); grouped.set(r.date, values) }
  const dates = [...grouped.keys()].sort(); const keys = sentiment ? [1, 2, 3] : [0]; const colors = ['#806cbe', '#308066', '#c4664f', '#91a0ae']
  const max = Math.max(1, ...dates.flatMap(d => keys.map(k => grouped.get(d)![k])))
  const title = sentiment ? (en ? 'Brand opinion trend' : '正负向评价走势') : (en ? 'Topic discussion over time' : '主题讨论热度')
  return <figure><figcaption>{title}</figcaption>{!dates.length ? <p>{en ? 'No dated sources in this range.' : '此范围暂无带日期的数据。'}</p> : <svg viewBox="0 0 520 230" role="img" aria-label={title}>
    {[0, .5, 1].map(n => <g key={n}><line x1="45" x2="500" y1={185 - n * 150} y2={185 - n * 150} stroke="#e5e4df"/><text x="5" y={189 - n * 150}>{Math.round(max * n)}</text></g>)}
    {keys.map(k => <g key={k}><polyline fill="none" stroke={colors[k]} strokeWidth="2.5" points={dates.map((d, i) => `${45 + i * 450 / Math.max(1, dates.length-1)},${185 - grouped.get(d)![k] / max * 150}`).join(' ')} />{dates.map((d, i) => <circle key={d} r="3.5" fill={colors[k]} cx={45 + i * 450 / Math.max(1, dates.length-1)} cy={185 - grouped.get(d)![k] / max * 150}><title>{d}: {grouped.get(d)![k]}</title></circle>)}</g>)}
    <text x="45" y="212">{dates[0]}</text><text x="495" y="212" textAnchor="end">{dates[dates.length-1]}</text></svg>}
    {sentiment && <small><span style={{color:colors[1]}}>{en ? 'Positive' : '正向'}</span> · <span style={{color:colors[2]}}>{en ? 'Negative' : '负向'}</span> · {en ? 'Neutral (grey)' : '中性（灰）'}</small>}
  </figure>
}
function Scatter({ points, en, onTopic }: { points: Point[]; en: boolean; onTopic: (id: string) => void }) {
  const max = Math.max(1, ...points.map(p => p.mentions)); const title = en ? 'Discussion volume × negative share' : '讨论量 × 负向占比'
  return <figure className="ox-scatter"><figcaption>{title}</figcaption><svg viewBox="0 0 600 260" role="img" aria-label={title}>
    {[0, .5, 1].map(n => <g key={n}><line x1="55" x2="570" y1={210-n*170} y2={210-n*170} stroke="#e5e4df"/><text x="5" y={214-n*170}>{n*100}%</text></g>)}
    {points.filter(p => p.negative_ratio !== null).map(p => <circle key={p.id} tabIndex={0} role="button" aria-label={en ? p.name_en : p.name} onClick={() => onTopic(p.id)} onKeyDown={e => { if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTopic(p.id) } }} cx={55+p.mentions/max*505} cy={210-(p.negative_ratio || 0)*170} r={Math.min(16, 5+Math.log2(p.likes+1))} fill="#bd7559" fillOpacity=".7" stroke="#fff"><title>{en?p.name_en:p.name}: {p.mentions} · {((p.negative_ratio || 0)*100).toFixed(1)}% · ♥ {p.likes}</title></circle>)}
    <text x="55" y="242">0</text><text x="560" y="242" textAnchor="end">{max} {en?'mentions':'次讨论'}</text></svg><small>{en?'Point size = likes · click to inspect · topics without opinions are omitted.':'点大小表示点赞量 · 点击查看来源 · 无评价的主题不显示负向占比。'}</small></figure>
}
