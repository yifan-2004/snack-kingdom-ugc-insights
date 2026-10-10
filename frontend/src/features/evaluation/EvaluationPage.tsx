import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../../lib/api'
import { useLanguage } from '../../i18n/LanguageContext'
import './evaluation.css'

type Question = { id: string; question: string; category: string; reference_answer: string; rubric: string; signals: string[]; minimum_evidence: number }
type Result = { id: string; answer: string; error: string | null; latency_seconds: number; checks: { answer_present?: boolean; enough_evidence?: boolean; citation_ids_valid?: boolean; signal_coverage?: number | null }; human_correct: boolean | null; human_note?: string; evidence: { chunk_id: string; post_id: string; text: string }[] }
type Run = { id: string; created_at: string; status: string; questions: Question[]; results: Result[]; config: { engine: string; concurrency: number }; metrics: { elapsed_seconds?: number; throughput_qps?: number; p50_seconds?: number; p95_seconds?: number; failure_rate?: number; max_concurrent_requests?: number; worker_processes?: number }; error?: string }
const active = (run?: Run | null) => !!run && ['preparing', 'running', 'cancelling'].includes(run.status)
const blank = { question: '', category: '自定义', reference_answer: '', rubric: '', signals: [] as string[], minimum_evidence: 1 }
function categoryTitle(value: string, en: boolean) {
  const names: Record<string, [string,string]> = { scope_statistics:['样本数量','Sample size'], sentiment_statistics:['情感统计','Sentiment'], quality_statistics:['数据质量','Data quality'], topic_insight:['主题洞察','Topic insights'], platform_topic:['平台主题','Platform topics'], platform_comparison:['平台比较','Platform comparisons'], grounding:['证据溯源','Evidence'], robustness:['安全与边界','Safety & limitations'], mixed_intent:['混合问题','Mixed intent'], ambiguous_query:['歧义问题','Ambiguous queries'] }
  return names[value]?.[en ? 1 : 0] || value
}

export function EvaluationPage({ onOpenPost }: { onOpenPost: (id: string) => void }) {
  const { language } = useLanguage(); const en = language === 'en'; const t = (zh: string, eng: string) => en ? eng : zh
  const [questions, setQuestions] = useState<Question[]>([]); const [selected, setSelected] = useState<string[]>([])
  const [history, setHistory] = useState<Run[]>([]); const [run, setRun] = useState<Run | null>(null)
  const [engine, setEngine] = useState('parallel'); const [concurrency, setConcurrency] = useState(2)
  const [draft, setDraft] = useState(blank); const [editing, setEditing] = useState(false)
  const [filter, setFilter] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const [notes, setNotes] = useState<Record<string, string>>({})
  useEffect(() => {
    const controller = new AbortController()
    apiGet<Question[]>('/api/evaluation/questions', controller.signal).then(setQuestions).catch(e => { if(!controller.signal.aborted) setError(String(e.message)) })
    apiGet<Run[]>('/api/evaluation/runs', controller.signal).then(rows => { setHistory(rows); if (rows[0]) void apiGet<Run>(`/api/evaluation/runs/${rows[0].id}`, controller.signal).then(setRun).catch(() => {}) }).catch(() => {})
    return () => controller.abort()
  }, [])
  useEffect(() => {
    if (!active(run)) return
    const controller = new AbortController()
    let stopped = false
    let timer: number | undefined
    const advance = async () => {
      try {
        const next = await apiPost<Run>(`/api/evaluation/runs/${run!.id}/step`)
        if (stopped) return
        setRun(next)
        if (!active(next)) setHistory(await apiGet<Run[]>('/api/evaluation/runs', controller.signal))
        else timer = window.setTimeout(advance, 250)
      } catch (e) { if (!stopped) setError(`${t('评估已暂停；已完成的逐题结果已保存。请刷新页面继续。', 'Evaluation paused; completed answers are saved. Refresh to continue.')} ${(e as Error).message}`) }
    }
    timer = window.setTimeout(advance, 100)
    return () => { stopped = true; clearTimeout(timer); controller.abort() }
  }, [run?.id, run?.status])
  const visible = questions.filter(q => !filter || q.category === filter)
  async function start() {
    setBusy(true); setError('')
    try { setRun(await apiPost<Run>('/api/evaluation/runs', { question_ids: selected, engine, concurrency, requests_per_minute: 15, top_k: 8, locale: language })) }
    catch(e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function add() {
    setBusy(true); setError('')
    try { const q = await apiPost<Question>('/api/evaluation/questions', draft); setQuestions(current => [...current, q]); setDraft(blank); setEditing(false) }
    catch(e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function grade(id: string, correct: boolean) {
    if (!run || !notes[id]?.trim()) return
    setBusy(true)
    try { setRun(await apiPost<Run>('/api/evaluation/grade', { run_id: run.id, question_id: id, correct, note: notes[id] })) }
    catch(e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(run, null, 2)], {type:'application/json'}))
    const a = document.createElement('a'); a.href = url; a.download = `evaluation-${run?.id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const graded = run?.results.filter(r => r.human_correct !== null) || []
  const status: Record<string, string> = { preparing: t('准备知识库与问题向量', 'Preparing retrieval'), running: t('并行处理中', 'Processing in parallel'), cancelling:t('停止新请求，等待当前请求结束', 'Stopping after active requests'), completed:t('已完成', 'Completed'), failed:t('失败', 'Failed'), cancelled:t('已停止', 'Stopped'), interrupted:t('上次运行被中断', 'Interrupted'), invalidated:t('数据已变化，本次结果不可作同版本对比', 'Data changed; run is not comparable') }
  return <section className="ev page" data-native-i18n><header><div><h1>{t('系统评估', 'System evaluation')}</h1><p>{t('用真实问题检查回答、证据与运行效率。', 'Inspect answers, evidence and runtime performance with real questions.')} <a href="/login?return_to=%2Fworkbench%2F%3Fpage%3Devaluation" target="_top">{t('所有者登录后可运行与判分', 'Sign in as owner to run and grade')}</a></p></div><button onClick={() => setEditing(!editing)}>{t('＋ 新增题目', '+ Add question')}</button></header>
    {error && <p role="alert">{error}</p>}
    {editing && <form className="ev-panel ev-form" onSubmit={e => {e.preventDefault(); void add()}}><label>{t('问题', 'Question')}<textarea required minLength={2} maxLength={500} value={draft.question} onChange={e => setDraft({...draft, question:e.target.value})}/></label><label>{t('分类', 'Category')}<input required maxLength={80} value={draft.category} onChange={e => setDraft({...draft, category:e.target.value})}/></label><label>{t('参考答案（选填，不会发送给答题模型）', 'Reference answer (optional; never sent to the answering model)')}<textarea maxLength={6000} value={draft.reference_answer} onChange={e => setDraft({...draft, reference_answer:e.target.value})}/></label><label>{t('人工检查要点', 'Review rubric')}<textarea maxLength={2000} value={draft.rubric} onChange={e => setDraft({...draft, rubric:e.target.value})}/></label><label>{t('最低检索证据数（拒答题可设为 0）', 'Minimum evidence count (0 for abstention cases)')}<input type="number" min={0} max={20} value={draft.minimum_evidence} onChange={e => setDraft({...draft,minimum_evidence:Number(e.target.value)})}/></label><button disabled={busy}>{t('保存题目', 'Save question')}</button></form>}
    <section className="ev-panel"><div className="ev-controls"><select aria-label={t('题目分类', 'Question category')} value={filter} onChange={e => setFilter(e.target.value)}><option value="">{t('全部分类', 'All categories')}</option>{[...new Set(questions.map(q => q.category))].map(c => <option key={c} value={c}>{categoryTitle(c, en)}</option>)}</select><button onClick={() => setSelected(visible.map(q => q.id).slice(0,200))}>{t('选择当前分类', 'Select visible')}</button><button onClick={() => setSelected([])}>{t('清空选择', 'Clear selection')}</button><span>{selected.length} / {questions.length}</span></div>
      <div className="ev-question-list">{visible.map(q => <label key={q.id}><input type="checkbox" checked={selected.includes(q.id)} onChange={e => setSelected(s => e.target.checked ? [...s,q.id].slice(0,200) : s.filter(id=>id!==q.id))}/><span data-original>{q.question}</span></label>)}</div>
      <div className="ev-controls"><select aria-label={t('执行方式', 'Execution mode')} value={engine} disabled={active(run)} onChange={e=>setEngine(e.target.value)}><option value="parallel">{t('云端并发评估', 'Cloud parallel')}</option><option value="serial">{t('串行基线', 'Sequential baseline')}</option></select><label>{t('并发数', 'Concurrency')} <input aria-label={t('并发数', 'Concurrency')} type="number" min={1} max={4} disabled={engine==='serial'||active(run)} value={concurrency} onChange={e=>setConcurrency(Math.max(1,Math.min(4,Number(e.target.value))))}/></label><button className="ev-primary" disabled={busy||active(run)||!selected.length} onClick={() => void start()}>{t('开始评估', 'Start evaluation')}</button>{active(run) && <button onClick={() => void apiPost('/api/evaluation/cancel', { run_id: run?.id }).then(()=>setRun(current=>current?{...current,status:'cancelled'}:current)).catch(e=>setError(e.message))}>{t('停止', 'Stop')}</button>}</div><small>{t('网页评估当前网站的确定性问答引擎，分批并发运行并保留逐题结果；不是本地 Ray 或模型评估。自动检查不等于人工准确率。', 'This evaluates the hosted deterministic QA engine in resumable batches, not local Ray or model quality. Automatic checks are not human accuracy.')}</small></section>
    <div className="ev-controls"><label>{t('历史记录', 'Run history')} <select aria-label={t('历史记录', 'Run history')} value={run?.id || ''} disabled={active(run)} onChange={e=>void apiGet<Run>(`/api/evaluation/runs/${e.target.value}`).then(setRun).catch(e=>setError(e.message))}><option value="">—</option>{[...(run && !history.some(r=>r.id===run.id) ? [run] : []), ...history].map(r=><option key={r.id} value={r.id}>{new Date(r.created_at).toLocaleString()} · {r.config.engine}</option>)}</select></label>{run && <button onClick={download}>{t('导出结果', 'Export results')}</button>}</div>
    {run && <section className="ev-panel"><h2>{run.status==='running'&&run.config.engine==='serial' ? t('串行处理中','Processing sequentially') : status[run.status]} · {run.results.length}/{run.questions.length}</h2><progress aria-label={t('评估进度','Evaluation progress')} value={run.results.length} max={run.questions.length}/><p>{t('实际最高并发','Peak concurrent requests')}: {run.metrics.max_concurrent_requests ?? '—'} · {t('独立工作进程','Worker processes')}: {run.metrics.worker_processes ?? '—'}</p><div className="ev-metrics">{[[t('总耗时','Elapsed'),run.metrics.elapsed_seconds,'s'],[t('吞吐量','Throughput'),run.metrics.throughput_qps,'q/s'],['p50',run.metrics.p50_seconds,'s'],['p95',run.metrics.p95_seconds,'s']].map(([label,value,unit])=><div key={String(label)}><small>{label}</small><strong>{value ?? '—'} <small>{unit}</small></strong></div>)}</div><p>{t('人工判分','Human review')}: {graded.filter(r=>r.human_correct).length}/{graded.length} {t('正确（未判题目不计分）','correct (ungraded cases excluded)')} · {t('失败','Failed')}: {run.results.filter(r=>r.error).length}</p>
      {run.results.map(r => { const q = run.questions.find(q=>q.id===r.id)!; return <details key={r.id} className="ev-result"><summary>{q.question} <small> · {r.latency_seconds}s {r.error ? ` · ${t('请求失败','Request failed')}` : ''}</small></summary><p className="ev-answer" data-original>{r.answer || r.error}</p><p>{t('回答非空 / 证据数量 / 引用编号有效','Answer present / enough evidence / valid citation IDs')}: {[r.checks.answer_present,r.checks.enough_evidence,r.checks.citation_ids_valid].map(v=>v==null?'—':v?'✓':'✗').join(' / ')}</p><p data-original>{t('人工检查要点','Review rubric')}: {q.rubric}</p>{q.reference_answer && <blockquote data-original>{q.reference_answer}</blockquote>}
        <details><summary>{t('检索到的证据','Retrieved evidence')} ({r.evidence.length})</summary>{r.evidence.map(e=><article key={e.chunk_id}><p className="ev-answer" data-original>{e.text}</p><button onClick={()=>onOpenPost(e.post_id)}>{t('查看原帖','Open post')}</button></article>)}</details>
        {!active(run) && <div className="ev-grade"><input aria-label={`${t('判分说明','Review note')} ${r.id}`} placeholder={t('填写判分依据后确认','Enter a reason before grading')} value={notes[r.id]??r.human_note??''} onChange={e=>setNotes({...notes,[r.id]:e.target.value})}/><button disabled={busy||!notes[r.id]?.trim()} onClick={()=>void grade(r.id,true)}>{t('正确','Correct')}</button><button disabled={busy||!notes[r.id]?.trim()} onClick={()=>void grade(r.id,false)}>{t('错误','Incorrect')}</button><span>{r.human_correct===null?t('未判分','Ungraded'):r.human_correct?'✓':'✗'}</span></div>}
      </details> })}</section>}
  </section>
}
