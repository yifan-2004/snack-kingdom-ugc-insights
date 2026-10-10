import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, apiGet, apiPost } from '../../lib/api'
import { useLanguage } from '../../i18n/LanguageContext'
import './context-review.css'

interface Attributes {
  relevance: 'related' | 'unrelated' | 'uncertain'; target: 'brand' | 'blogger' | 'other' | 'unclear'
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed' | null
  intent: 'opinion' | 'inquiry' | 'factual' | 'social' | 'other'
  relevance_confidence: number; sentiment_confidence: number; description: string
  evidence: string[]; aspects: string[]; ambiguity: string[]
}
interface Case {
  post_id: string; post_title: string; comment_id: string; packet_hash: string; raw_text: string
  context: { post_text: string; parent_text: string }; attributes: Attributes | null; review_reasons: string[]
}
interface Queue { items: Case[]; total: number; posts: number; comments: number; legacy_posts: number }

export function ContextReviewPage({ active }: { active: boolean }) {
  const { language } = useLanguage(); const en = language === 'en'
  const t = (zh: string, english: string) => en ? english : zh
  const [queue, setQueue] = useState<Queue | null>(null)
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<Case | null>(null)
  const [draft, setDraft] = useState<Attributes | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [errorAction, setErrorAction] = useState<'load' | 'save'>('load')
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [authError, setAuthError] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)
  const refresh = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const next = await apiGet<Queue>(`/api/context-review?offset=${offset}&limit=25&q=${encodeURIComponent(query)}`)
      if (id !== requestId.current) return
      if (offset && offset >= next.total) setOffset(Math.max(0, Math.ceil(next.total / 25) * 25 - 25))
      setQueue(next); setError(false); setAuthError(false)
    } catch (e) { if (id === requestId.current) { setError(true); setErrorAction('load'); setAuthError(e instanceof ApiError && e.status === 401) } }
    finally { if (id === requestId.current) setLoading(false) }
  }, [offset, query])
  useEffect(() => { if (active) void refresh(); return () => { requestId.current++ } }, [active, refresh])
  useEffect(() => {
    if (!dirty || !active) return
    const guard = (e: Event) => { if (!window.confirm(t('放弃未保存的审核？', 'Discard this unsaved review?'))) e.preventDefault() }
    window.addEventListener('before-workbench-navigate', guard)
    return () => window.removeEventListener('before-workbench-navigate', guard)
  }, [dirty, active, en])
  function open(row: Case) {
    if (dirty && !window.confirm(t('放弃未保存的审核？', 'Discard this unsaved review?'))) return
    setSelected(row); setNote(''); setSaved(false); setDirty(false)
    setDraft(row.attributes ? { ...row.attributes, evidence: row.attributes.evidence.length ? row.attributes.evidence : [row.raw_text] } : {
      relevance: 'uncertain', target: 'unclear', sentiment: null, intent: 'other',
      relevance_confidence: 0, sentiment_confidence: 0, description: '', evidence: [row.raw_text], aspects: [], ambiguity: [],
    })
  }
  async function save() {
    if (!selected || !draft) return
    setBusy(true); setError(false)
    try {
      await apiPost('/api/context-review', { post_id: selected.post_id, comment_id: selected.comment_id,
        expected_packet_hash: selected.packet_hash, attributes: { ...draft, ambiguity: [] },
        note: note.trim() || t('结合原帖及回复上下文确认评论属性。', 'Confirmed attributes against post and reply context.') })
      setSelected(null); setDraft(null); setDirty(false); setSaved(true); await refresh()
    } catch (e) { setError(true); setErrorAction('save'); setAuthError(e instanceof ApiError && (e.status === 401 || e.status === 403)) } finally { setBusy(false) }
  }
  return <section className="cr-workspace" data-native-i18n>
    <header className="cr-heading"><div><small>{t('内容质量', 'CONTENT QUALITY')}</small><h1>{t('评论审核', 'Comment review')}</h1><p>{t('确认评论针对谁，以及对零食王国的态度。', 'Confirm who the comment refers to and its attitude toward Snack Kingdom.')}</p></div><div className="cr-count"><strong>{queue?.total ?? '—'}</strong><span>{t('待确认', 'to review')}</span></div></header>
    {queue && <p>{queue.posts} {t('篇帖子', 'posts')} · {queue.comments} {t('条原始评论', 'raw comments')} · {queue.total} {t('条待审核', 'need review')} · <a href="/login?return_to=%2Fworkbench%2F%3Fpage%3Dreview" target="_top">{t('所有者登录后可保存审核', 'Sign in as owner to save reviews')}</a></p>}
    {!!queue?.legacy_posts && <p role="status">{queue.legacy_posts} {t('篇旧版帖子尚未重新处理；旧数据未被当作人工审核结果。请在采集处理页面更新现有知识库。', 'legacy posts need reprocessing. Legacy data is not treated as human-reviewed. Update the existing knowledge corpus from Processing.')}</p>}
    {saved && <p role="status">{t('审核决定已保存。主题榜单和问答仍显示上次同步的分析，待下次数据处理与同步后更新。', 'Review saved. Rankings and Q&A still use the last synced analysis until data is reprocessed and synced.')}</p>}
    {error && <p role="alert">{authError ? t('请以站点所有者身份登录后再审核。', 'Sign in as the site owner before reviewing.') : errorAction === 'load' ? t('列表暂时无法加载，请点击刷新。', 'The queue could not be loaded. Please refresh.') : t('未能确认保存结果。请刷新列表检查该条是否仍待审核，再尝试提交。', 'Could not confirm the save. Refresh the list and check whether this item still needs review before retrying.')} {errorAction === 'save' && <a href="/login?return_to=%2Fworkbench%2F%3Fpage%3Dreview" target="_top">{t('登录', 'Sign in')}</a>}</p>}
    <div className="cr-columns"><aside className="cr-queue"><div className="cr-toolbar"><input maxLength={200} aria-label={t('搜索评论', 'Search comments')} placeholder={t('搜索评论或帖子', 'Search comments or posts')} value={query} disabled={busy} onChange={e => { setQuery(e.target.value); setOffset(0) }} /><button onClick={() => void refresh()} disabled={busy || loading}>{t('刷新', 'Refresh')}</button></div>
    {loading && <p role="status">{t('加载中…', 'Loading…')}</p>}
    <ul className="cr-list">{queue?.items.map(row => <li key={`${row.post_id}:${row.comment_id}`}><button aria-label={row.raw_text} aria-pressed={selected?.comment_id === row.comment_id} disabled={busy} onClick={() => open(row)}><small>{row.post_title || t('未命名帖子', 'Untitled post')}</small><span>{row.raw_text}</span><em>{row.review_reasons.includes('model_analysis_failed') ? t('分析未完成', 'Analysis incomplete') : t('需结合上下文确认', 'Check context')}</em></button></li>)}</ul>
    {queue && !queue.total && <p>{t('当前没有需要审核的评论属性。', 'No comment attributes currently need review.')}</p>}
    <footer className="cr-pagination"><button disabled={busy || offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>{t('上一页', 'Previous')}</button><span>{Math.floor(offset/25)+1} / {Math.max(1,Math.ceil((queue?.total || 0)/25))}</span>
    <button disabled={busy || !queue || offset + 25 >= queue.total} onClick={() => setOffset(offset + 25)}>{t('下一页', 'Next')}</button>
    </footer></aside><article className="cr-detail">
    {!selected && <div className="cr-empty"><span>✓</span><h2>{saved ? t('这一条已完成', 'Review saved') : t('选择一条评论', 'Select a comment')}</h2><p>{t('在左侧选择评论，对照上下文确认属性。', 'Choose a comment on the left to review it in context.')}</p></div>}
    {selected && draft && <form onChange={() => setDirty(true)} onSubmit={e => { e.preventDefault(); void save() }}><fieldset disabled={busy}>
      <h2>{t('原始评论', 'Original comment')}</h2><blockquote className="cr-quote">{selected.raw_text}</blockquote>
      <details className="cr-context" open><summary>{t('原帖与回复上下文', 'Post and reply context')}</summary><strong>{selected.post_title}</strong><p>{selected.context.post_text || t('原帖没有文字内容', 'No post text')}</p>
      {selected.context.parent_text && <blockquote>{selected.context.parent_text}</blockquote>}
      </details><div className="cr-fields">
      <label>{t('讨论对象', 'Target')}<select value={draft.target} onChange={e => {
        const target = e.target.value as Attributes['target']; setDraft({ ...draft, target,
          relevance: target === 'brand' ? 'related' : target === 'unclear' ? 'uncertain' : 'unrelated',
          sentiment: target === 'brand' ? draft.sentiment || 'neutral' : null })
      }}><option value="unclear">{t('待确认', 'Unresolved')}</option><option value="brand">{t('零食王国', 'Snack Kingdom')}</option><option value="blogger">{t('博主', 'Creator')}</option><option value="other">{t('其他', 'Other')}</option></select></label>
      {draft.relevance === 'related' && <label>{t('针对品牌的情感', 'Brand sentiment')}<select value={draft.sentiment || 'neutral'} onChange={e => setDraft({ ...draft, sentiment: e.target.value as Attributes['sentiment'] })}>{[['positive','正向','Positive'],['neutral','中性','Neutral'],['negative','负向','Negative'],['mixed','褒贬并存','Mixed']].map(([v,zh,eng]) => <option key={v} value={v}>{t(zh,eng)}</option>)}</select></label>}
      <label>{t('表达意图', 'Intent')}<select value={draft.intent} onChange={e => setDraft({ ...draft, intent: e.target.value as Attributes['intent'] })}>{[['opinion','评价','Opinion'],['inquiry','询问','Question'],['factual','事实','Factual'],['social','社交','Social'],['other','其他','Other']].map(([v,zh,eng]) => <option key={v} value={v}>{t(zh,eng)}</option>)}</select></label>
      </div><label>{t('评论简述', 'Comment description')}<textarea required rows={2} maxLength={250} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
      <details className="cr-extra"><summary>{t('判断依据与补充说明', 'Evidence and review notes')}</summary><p>{t('模型置信度：对象 / 情感', 'Model confidence: target / sentiment')} {Math.round(draft.relevance_confidence*100)}% / {Math.round(draft.sentiment_confidence*100)}%</p>
      <p>{t('置信度仅为模型自报，并非人工评分。', 'Confidence is model-reported, not a human score.')}</p>
      <label>{t('原文证据（每行一段）', 'Verbatim evidence (one quote per line)')}<textarea required value={draft.evidence.join('\n')} onChange={e => setDraft({ ...draft, evidence: e.target.value.split('\n').filter(Boolean) })} /></label>
      <label>{t('审核说明（选填）', 'Review note (optional)')}<textarea maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></label></details></fieldset>
      <footer className="cr-actions"><span>{t('仅确认属性，不改原文', 'Confirms attributes, not source text')}</span><button type="button" disabled={busy} onClick={() => { if (!dirty || window.confirm(t('放弃未保存的审核？', 'Discard this unsaved review?'))) { setSelected(null); setDraft(null); setDirty(false) } }}>{t('稍后处理', 'Review later')}</button><button className="cr-confirm" type="submit" disabled={busy || draft.target === 'unclear' || !draft.description.trim() || !draft.evidence.length || draft.evidence.some(q => !q.trim() || !selected.raw_text.includes(q))}>{busy ? t('保存中…', 'Saving…') : t('确认属性', 'Confirm attributes')}</button></footer>
    </form>}</article></div>
  </section>
}
