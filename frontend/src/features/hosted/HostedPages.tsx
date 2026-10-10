import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../../lib/api'
import { useLanguage } from '../../i18n/LanguageContext'
import './hosted.css'

type Overview = { sample_size?: number; comment_count?: number; completed_at?: string }
type CloudJob = { id:string;status:string;keyword:string;start_date:string;end_date:string;max_posts:number;searched_pages:number;processed_count:number;skipped_count:number;error_message?:string|null }
type CloudItem = { id:string;external_post_id:string;title:string;source_url:string;status:string;raw_comment_count:number;valid_comment_count:number;summary:string }
type RagResponse = { answer: string; evidence?: Array<{ chunkId: string; title: string; excerpt: string; sourceUrl?: string }>; generator?: string; modelUsed?: boolean; limitations?: string[] }

export function HostedCollectionPage() {
  const { language } = useLanguage(); const en = language === 'en'
  const [data, setData] = useState<Overview | null>(null)
  const [owner, setOwner] = useState(false)
  const [jobs, setJobs] = useState<CloudJob[]>([])
  const [items, setItems] = useState<CloudItem[]>([])
  const [keyword, setKeyword] = useState('零食王国')
  const [start, setStart] = useState(() => new Date(Date.now()-6*86400000).toISOString().slice(0,10))
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0,10))
  const [limit, setLimit] = useState(10)
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [activity, setActivity] = useState('')
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  const active = jobs.find(j => ['queued','running','busy'].includes(j.status))
  const latest = active || jobs[0]
  async function refresh(){try{setData(await apiGet<Overview>('/api/overview/latest'));const session=await apiGet<{owner:boolean}>('/api/workbench/session');setOwner(session.owner);if(session.owner){const list=await apiGet<CloudJob[]>('/api/web-collection/jobs');setJobs(list);if(list[0])setItems(await apiGet<CloudItem[]>(`/api/web-collection/jobs/${list[0].id}/items`))}setError('')}catch(e){setError((e as Error).message)}}
  useEffect(() => {void refresh()}, [])
  useEffect(() => {if(!running||!active||busy)return;const timer=window.setTimeout(async()=>{setBusy(true);try{const result=await apiPost<{activity:string}>(`/api/web-collection/jobs/${active.id}/step`);setActivity(result.activity);await refresh()}catch(e){setError((e as Error).message);setRunning(false)}finally{setBusy(false)}},350);return()=>window.clearTimeout(timer)},[running,active?.id,active?.status,busy,jobs.length])
  async function create(event:React.FormEvent){event.preventDefault();setBusy(true);setError('');try{await apiPost('/api/web-collection/jobs',{keyword,start_date:start,end_date:end,max_posts:limit});await refresh();setRunning(true);setActivity(en?'Job started':'任务已创建')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function retry(jobId:string){setBusy(true);setError('');try{await apiPost(`/api/web-collection/jobs/${jobId}/retry`);await refresh();setRunning(true)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function openItem(item:CloudItem){try{setSelected(await apiGet<Record<string,unknown>>(`/api/web-collection/packet/xhs/${encodeURIComponent(item.external_post_id)}`))}catch(e){setError((e as Error).message)}}
  const packetPost=(selected?.post||{}) as Record<string,unknown>;const packetAnalysis=(selected?.analysis||{}) as Record<string,unknown>;const packetComments=Array.isArray(selected?.comments)?selected.comments as Array<Record<string,unknown>>:[]
  return <section className="hosted-panel hosted-collection"><h1>{en?'Collection & processing':'采集与处理'}</h1><p>{en?'Run small cloud collection batches while the local app is closed. Only the signed-in site owner can start jobs; keys stay on the server.':'本地 App 关闭时也可在网页独立采集。只有站点所有者能启动任务；密钥保存在后台，不会出现在浏览器。'}</p>
    {error&&<p role="alert" className="hosted-error">{error}</p>}
    {!owner?<div className="hosted-card"><p>{en?'Sign in with the owner account to use collection.':'请使用站点所有者账号登录，才能使用采集功能。'}</p><a href="/login?return_to=%2Fworkbench%2F%3Fpage%3Dcollection" target="_top">{en?'Sign in':'登录'}</a></div>:<>
      <div className="hosted-card"><h2>{en?'New cloud collection':'新建云端采集'}</h2><p>{en?'Xiaohongshu text/image posts only. Video posts are skipped. Each batch processes up to 10 posts and analyzes up to 60 comments per post. TikHub and model API usage may incur charges.':'目前采集小红书图文帖；视频帖跳过。每批最多处理 10 篇帖子、每帖最多分析 60 条评论。调用 TikHub 与模型可能产生费用。'}</p><form className="hosted-collection-form" onSubmit={create}><label>{en?'Keyword':'关键词'}<input value={keyword} onChange={e=>setKeyword(e.target.value)} maxLength={40} required /></label><label>{en?'From':'开始日期'}<input type="date" value={start} onChange={e=>setStart(e.target.value)} required /></label><label>{en?'To':'结束日期'}<input type="date" value={end} onChange={e=>setEnd(e.target.value)} required /></label><label>{en?'Post limit':'帖子上限'}<input type="number" value={limit} min={1} max={10} onChange={e=>setLimit(Number(e.target.value))} /></label><button disabled={busy||!!active||keyword.trim().length<2}>{en?'Start collection':'开始采集'}</button></form></div>
      {latest&&<div className="hosted-card"><h2>{en?'Current job':'当前任务'}</h2><div className="hosted-collection-status"><strong>{latest.keyword}</strong><span>{latest.start_date}—{latest.end_date}</span><span>{en?'Status':'状态'}：{latest.status}</span><span>{en?'Processed':'已处理'} {latest.processed_count} / {latest.max_posts}</span><span>{en?'Skipped':'跳过视频'} {latest.skipped_count}</span></div>{activity&&<p role="status">{activity}</p>}{latest.error_message&&<p role="alert" className="hosted-error">{latest.error_message}</p>}{active&&!running&&<button onClick={()=>setRunning(true)} disabled={busy}>{en?'Continue processing':'继续处理'}</button>}{active&&running&&<button onClick={()=>setRunning(false)} disabled={busy}>{en?'Pause after this step':'本步结束后暂停'}</button>}{latest.status==='failed'&&<button onClick={()=>void retry(latest.id)} disabled={busy}>{en?'Retry from saved step':'从保存处重试'}</button>}{['failed','completed'].includes(latest.status)&&<button onClick={()=>void refresh()}>{en?'Refresh results':'刷新结果'}</button>}<p>{en?'The browser drives one bounded step at a time. Closing this page pauses the job; reopen it to continue. Collected results are saved in the cloud. They are not counted in the existing overview until a compatible publication step is completed.':'网页每次执行一个受控步骤。关闭页面会暂停任务，重新打开后可继续；已采集结果保存在云端。新结果尚未通过兼容性发布前，不会混入现有舆情总览统计。'}</p></div>}
      {!!items.length&&<div className="hosted-card"><h2>{en?'Collected posts':'采集结果'}</h2><div className="hosted-collection-items">{items.map(item=><article key={item.id}><strong>{item.title||item.external_post_id}</strong><span>{item.status==='processed'?`${item.valid_comment_count} / ${item.raw_comment_count} ${en?'comments analyzed':'条评论已分析'}`:en?'Waiting to process':'等待处理'}</span>{item.summary&&<p>{item.summary}</p>}<div><button disabled={item.status!=='processed'} onClick={()=>void openItem(item)}>{en?'View analysis':'查看分析'}</button><a href={item.source_url} target="_blank" rel="noopener noreferrer">{en?'Source post':'原帖'}</a></div></article>)}</div></div>}
      {selected&&<div className="hosted-card"><h2>{en?'Post analysis':'帖子分析'}</h2><button onClick={()=>setSelected(null)}>{en?'Close':'关闭'}</button> <button onClick={()=>{const blob=new Blob([JSON.stringify(selected,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`${String(packetPost.platform||'xhs')}-${String(packetPost.id||'post')}.json`;link.click();URL.revokeObjectURL(url)}}>{en?'Download JSON':'下载 JSON'}</button><p><strong>{String(packetPost.title||'')}</strong> {String(packetPost.body||'')}</p><p>{String((packetAnalysis.post as Record<string,unknown>|undefined)?.summary||'')}</p><h3>{en?'Comments':'评论'}</h3><div className="hosted-collection-comments">{packetComments.map((c,i)=>{const a=(c.analysis||{}) as Record<string,unknown>;return <p key={String(c.id||i)}><span>{String(a.target||'—')} · {String(a.sentiment||'—')} · {String(a.topic||'')}</span><br/>{String(c.text||'')}<br/><small>{String(a.summary||'')}</small></p>})}</div></div>}
    </>}
    <div className="hosted-stats"><div><strong>{data?.sample_size??'—'}</strong><span>{en?'Published posts':'总览已发布帖子'}</span></div><div><strong>{data?.comment_count??'—'}</strong><span>{en?'Published comments':'总览已发布评论'}</span></div></div>
  </section>
}

export function HostedModelPage() {
  const { language } = useLanguage(); const en = language === 'en'
  return <section className="hosted-panel"><h1>{en ? 'How this site runs' : '网页运行方式'}</h1><p>{en ? 'The overview and content details currently use the published local-app mirror. The cloud collection page independently calls TikHub and Qwen for small text/image batches and saves its own results; these are kept separate until a compatible publication step.' : '舆情总览和内容详情目前使用已发布的本地 App 镜像。云端采集页可独立调用 TikHub 与 Qwen 处理小批量图文数据，结果单独保存，尚未通过兼容性发布前不混入总览。'}</p><p>{en ? 'Web Q&A and evaluation use the current hosted retrieval engine. The web worker does not run local Chroma or Ray.' : '网页问答与评估使用本站检索引擎。网页后台不运行本地 Chroma 或 Ray。'}</p></section>
}

export function HostedRagPage() {
  const { language } = useLanguage(); const en = language === 'en'
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<RagResponse | null>(null)
  const [report, setReport] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setAnswer(null); setReport(''); setError('') }, [language])
  async function ask() { if (question.trim().length < 2) return; setBusy(true); setError(''); try { setAnswer(await apiPost<RagResponse>('/api/workbench/qa', { question: question.trim(), locale: language })) } catch(e) { setError((e as Error).message) } finally { setBusy(false) } }
  async function generate() { setBusy(true); setError(''); try { const value = await apiPost<{ report: string }>('/api/workbench/report', { locale: language }); setReport(value.report) } catch(e) { setError((e as Error).message) } finally { setBusy(false) } }
  return <section className="hosted-panel"><h1>{en ? 'Reports & Q&A' : '报告与问答'}</h1><p>{en ? 'Answers and reports are generated from the current web corpus; check the cited sources. This is not the local model or vector index.' : '基于网站当前知识库生成；回答和报告请核对来源。这里不等同于本地模型及向量库的结果。'}</p>{error && <p role="alert">{error}</p>}
    <div className="hosted-card"><h2>{en ? 'Ask a question' : '提出问题'}</h2><textarea aria-label={en ? 'Question' : '问题'} value={question} onChange={e => setQuestion(e.target.value)} placeholder={en ? 'What are customers discussing most?' : '例如：用户最常讨论什么问题？'} rows={3} maxLength={500}/><button disabled={busy || question.trim().length < 2} onClick={() => void ask()}>{busy ? en ? 'Working…' : '处理中…' : en ? 'Ask' : '提问'}</button>{answer && <div className="hosted-answer"><h3>{en ? 'Answer' : '回答'}</h3><p>{answer.answer}</p>{answer.evidence?.length ? <details><summary>{en ? `Retrieved evidence (${answer.evidence.length})` : `查看检索证据（${answer.evidence.length}）`}</summary>{answer.evidence.map(e => <blockquote key={e.chunkId}><strong>{e.title}</strong><p>{e.excerpt}</p>{e.sourceUrl && <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer">{en ? 'Open source' : '查看来源'}</a>}</blockquote>)}</details> : null}</div>}</div>
    <div className="hosted-card"><h2>{en ? 'Generate report' : '生成报告'}</h2><button disabled={busy} onClick={() => void generate()}>{busy ? en ? 'Working…' : '处理中…' : en ? 'Generate report' : '生成当前范围报告'}</button>{report && <article className="hosted-answer"><pre>{report}</pre><button onClick={() => { const blob = new Blob([report], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = en ? 'snack-kingdom-report.txt' : '零食王国舆情报告.txt'; a.click(); URL.revokeObjectURL(url) }}>{en ? 'Download text' : '下载文本'}</button></article>}</div></section>
}
