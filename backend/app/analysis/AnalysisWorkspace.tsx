"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AnalysisApi = { get<T>(path: string): Promise<T>; post<T>(path: string, body: unknown): Promise<T> };
type Scope = { platform: string; start: string | null; end: string | null; topic: string | null; target: string | null };
type Evidence = { id: string; case_id: string; revision: number; quote: string; context?: string; post_id: string; platform?: string; topic: string; target: string; kind: string };
type Topic = { id: string; name_en: string; name_zh: string; comment_count: number; opinion_count: number; question_count: number; sentiment: Record<string, number>; evidence: Evidence[] };
type Snapshot = { snapshot_id: string; total: number; pending: number; confirmed: number; excluded: number; brand_opinion_comments: number; brand_non_opinion_comments: number; other_target_comments: number; sentiment: Record<string, number>; negative_share: number | null; topics: Topic[] };
type Result = { markdown: string; evidence: Evidence[]; snapshot_id?: string; snapshot?: Snapshot; locale: string; retrieval_mode?: string; route?: string };
type Job = { id: string; status: string; kind: string; engine: string; execution?: string; total: number; completed: number; failed: number; worker_count: number; active_seconds: number; throughput_per_second?: number; evaluation?: { count: number; accuracy: number | null; macro_f1_present_classes: number | null } };
type Capabilities = { mode: string; jobs: boolean; model: boolean; review: boolean; ray: boolean };
const topics = [["price","价格","Price"],["queue","排队","Queue"],["service","服务","Service"],["product","商品","Product"],["availability","库存","Availability"],["promotion","促销","Promotion"],["environment","环境","Environment"],["location","位置","Location"],["content","内容","Content"],["other","其他","Other"]];
const activeStates = new Set(["queued","preparing","parallel_running","serial_running","validating","cancelling"]);
const initialScope: Scope = { platform: "all", start: null, end: null, topic: null, target: null };

export function AnalysisWorkspace({ locale, api, onReview, view = "analysis" }: { locale: "en" | "zh-CN"; api: AnalysisApi; onReview?: (id?: string, revision?: number) => void; view?: "analysis" | "overview" }) {
  const en = locale === "en";
  const t = (zh: string, english: string) => en ? english : zh;
  const [scope, setScope] = useState<Scope>(initialScope);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [question, setQuestion] = useState("");
  const [hyde, setHyde] = useState(false);
  const [useModel, setUseModel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobKind, setJobKind] = useState("analysis");
  const [engine, setEngine] = useState("rules");
  const [execution, setExecution] = useState("auto");
  const [workers, setWorkers] = useState(4);
  const [limit, setLimit] = useState(100);
  const [rpm, setRpm] = useState(30);
  const sequence = useRef(0);
  const mounted = useRef(true);
  const currentLocale = useRef(locale);
  currentLocale.current = locale;
  const scopeKey = JSON.stringify(scope);
  const requestScope = useRef(scopeKey);
  requestScope.current = scopeKey;

  function failure(value: unknown) {
    const code = value instanceof Error ? value.message : "";
    const messages: Record<string, [string, string]> = {
      snapshot_changed: ["数据已更新，请刷新后重新生成。", "Data changed. Refresh before generating again."],
      model_not_configured: ["模型服务尚未配置。", "The model service is not configured."],
      narrow_scope_for_hyde: ["语义检索请先缩小到 300 条证据以内。", "Narrow the scope to 300 evidence items before semantic retrieval."],
      no_eligible_comments: ["没有符合条件的评论。评估需要已确认记录，分析需要待审核记录。", "No eligible comments. Evaluation requires confirmed records; analysis requires pending records."],
      backend_not_configured: ["网站尚未连接分析后台。请在本地工作台使用审核、报告和 Ray 任务。", "The website is not connected to the analysis backend. Use the local workbench for review, reports and Ray jobs."],
      analysis_busy: ["已有任务正在运行，请等待或先取消。", "A task is running. Wait for it or cancel it first."],
      invalid_model_answer: ["模型回答未通过语言或引用校验，请重试或关闭 AI 撰写查看证据。", "The answer failed language or citation checks. Retry or turn off AI writing to inspect evidence."],
    };
    setError(messages[code]?.[en ? 1 : 0] || t("操作未完成。已有结果未被覆盖，请稍后重试。", "The action could not finish. Existing results are preserved; try again."));
  }
  const refresh = useCallback(async () => {
    const id = ++sequence.current;
    setLoading(true); setError("");
    try {
      const data = await api.post<Snapshot>("/api/analysis/snapshot", { scope, locale });
      if (id === sequence.current && mounted.current) { setSnapshot(data); setResult(old => old && (old.snapshot_id || old.snapshot?.snapshot_id) === data.snapshot_id ? old : null); }
    } catch (e) { if (id === sequence.current && mounted.current) failure(e); }
    finally { if (id === sequence.current && mounted.current) setLoading(false); }
  }, [api, scopeKey, locale]); // scope is represented by its canonical serialized value

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; sequence.current++; }; }, []);
  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(location.search);
      const platform = params.get("analysis_platform") || "all";
      const topic = params.get("analysis_topic");
      const target = params.get("analysis_target");
      const day = (name: string) => /^\d{4}-\d{2}-\d{2}$/.test(params.get(name) || "") ? params.get(name) : null;
      setScope({ platform: ["all","xhs","douyin","manual"].includes(platform) ? platform : "all", topic: topics.some(row => row[0] === topic) ? topic : null, target: ["brand","store","product"].includes(target || "") ? target : null, start: day("analysis_start"), end: day("analysis_end") });
    };
    read(); window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    setResult(null);
    api.get<Capabilities>("/api/analysis/capabilities").then(data => { if (mounted.current) setCapabilities(data); }).catch(failure);
  }, [api, locale]);
  useEffect(() => {
    if (!capabilities?.jobs) return;
    let disposed = false, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const data = await api.get<{items: Job[]}>("/api/analysis/jobs"); if (!disposed) setJobs(data.items); }
      catch { /* Keep prior task progress; explicit refresh reports connectivity errors. */ }
      finally { if (!disposed) timer = setTimeout(poll, 2500); }
    };
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [api, capabilities?.jobs]);
  function change(next: Scope) {
    setScope(next); setSnapshot(null); setResult(null); setError("");
    const url = new URL(location.href);
    for (const [key, value] of Object.entries(next)) {
      if (value && value !== "all") url.searchParams.set("analysis_" + key, value);
      else url.searchParams.delete("analysis_" + key);
    }
    history.pushState(null, "", url);
  }
  async function generate(kind: "report" | "ask") {
    if (!snapshot || busy) return;
    const captured = scopeKey, language = locale;
    setBusy(true); setError("");
    try {
      const data = await api.post<Result>("/api/analysis/" + kind, { scope, locale, snapshot_id: snapshot.snapshot_id, ...(kind === "ask" ? { question: question.trim(), hyde, use_model: useModel } : {}) });
      if (mounted.current && requestScope.current === captured && currentLocale.current === language) setResult(data);
    } catch (e) { if (mounted.current) failure(e); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function task(path: string, body: unknown) {
    setBusy(true); setError("");
    try { await api.post(path, body); const data = await api.get<{items: Job[]}>("/api/analysis/jobs"); if (mounted.current) setJobs(data.items); }
    catch (e) { if (mounted.current) failure(e); }
    finally { if (mounted.current) setBusy(false); }
  }
  function download() {
    if (!result) return;
    const references = result.evidence.map((e,i) => `[${i+1}] ${e.id}\n> ${e.quote.replace(/\n/g," ")}`).join("\n\n");
    const blob = new Blob([result.markdown, "\n\n", en ? "## Original evidence\n\n" : "## 原文证据\n\n", references], {type:"text/markdown;charset=utf-8"});
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href=url; a.download=`snack-insights-${locale}-${(result.snapshot_id || result.snapshot?.snapshot_id || "").slice(0,8)}.md`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function status(value: string) {
    const map: Record<string,[string,string]> = {queued:["排队中","Queued"],preparing:["准备中","Preparing"],parallel_running:["Ray 并行处理中","Ray parallel processing"],serial_running:["顺序处理中","Sequential processing"],validating:["校验中","Validating"],completed:["已完成","Completed"],partial:["部分完成","Partially completed"],failed:["失败","Failed"],cancelled:["已取消","Cancelled"],interrupted:["已中断","Interrupted"],cancelling:["正在取消","Cancelling"]};
    return map[value]?.[en?1:0] || t("状态未知","Unknown status");
  }
  return <section className="analysis-workspace" data-native-i18n>
    <header className="aw-header"><div><h1>{view === "overview" ? t("已审核洞察","Reviewed insights") : t("分析工作台","Analysis workspace")}</h1><p>{t("先确定范围，再查看事实、证据与建议。","Set the scope, then inspect facts, evidence and suggested actions.")}</p></div><button onClick={() => void refresh()} disabled={loading || busy}>{loading ? t("读取中…","Loading…") : t("刷新数据","Refresh data")}</button></header>
    <div className="aw-filters">
      <label>{t("平台","Platform")}<select value={scope.platform} disabled={busy} onChange={e=>change({...scope, platform:e.target.value})}><option value="all">{t("全部","All")}</option><option value="xhs">{t("小红书","XHS")}</option><option value="douyin">{t("抖音","Douyin")}</option><option value="manual">{t("手动录入","Manual intake")}</option></select></label>
      <label>{t("开始日期","From")}<input type="date" value={scope.start||""} max={scope.end||undefined} disabled={busy} onChange={e=>change({...scope,start:e.target.value||null})}/></label>
      <label>{t("结束日期","To")}<input type="date" value={scope.end||""} min={scope.start||undefined} disabled={busy} onChange={e=>change({...scope,end:e.target.value||null})}/></label>
      <label>{t("主题","Topic")}<select value={scope.topic||""} disabled={busy} onChange={e=>change({...scope,topic:e.target.value||null})}><option value="">{t("全部主题","All topics")}</option>{topics.map(row=><option key={row[0]} value={row[0]}>{row[en?2:1]}</option>)}</select></label>
      <label>{t("评价对象","Target")}<select value={scope.target||""} disabled={busy} onChange={e=>change({...scope,target:e.target.value||null})}><option value="">{t("品牌相关对象","Brand-related targets")}</option><option value="brand">{t("品牌","Brand")}</option><option value="store">{t("门店","Store")}</option><option value="product">{t("商品","Product")}</option></select></label>
      <button disabled={busy} onClick={()=>change(initialScope)}>{t("重置","Reset")}</button>
    </div>
    {error && <div role="alert" className="aw-error">{error}<button onClick={()=>setError("")} aria-label={t("关闭错误提示","Dismiss error")}>×</button></div>}
    {capabilities?.mode === "unavailable" && <p className="aw-notice">{t("分析后台未连接。现有帖子仍可浏览；新审核与并行任务请在本地使用。","Analysis backend is disconnected. Existing posts remain available; use the local app for review and parallel tasks.")}</p>}
    {snapshot && <>
      <div className="aw-metrics">{[[snapshot.confirmed,t("已确认评论","Confirmed comments")],[snapshot.pending,t("待审核评论","Pending comments")],[snapshot.brand_opinion_comments,t("品牌意见评论","Brand-opinion comments")],[snapshot.brand_non_opinion_comments,t("询问与事实","Questions & facts")]].map(([n,label])=><article key={String(label)}><strong>{n}</strong><span>{label}</span></article>)}</div>
      <p className="aw-note">{t("情感仅统计已确认且针对本品牌的意见。同一评论可涉及多个主题；对博主的评价不计入品牌口碑。","Sentiment counts confirmed opinions about this brand only. Topics can overlap; opinions about creators are excluded from brand sentiment.")}</p>
      {snapshot.confirmed === 0 && <div className="aw-empty"><h2>{t("还没有可用于结论的已审核评论","No reviewed comments are ready for conclusions")}</h2><p>{t("导入评论并核对评价对象、主题和情感后，报告与问答会使用同一批证据。","Import comments and verify targets, topics and sentiment. Reports and answers will then use the same evidence.")}</p>{onReview && <button onClick={()=>onReview()}>{t("去审核评论","Review comments")}</button>}</div>}
      <div className="aw-table-wrap"><table><caption>{t("主题与意见","Topics and opinions")}</caption><thead><tr>{[t("主题","Topic"),t("评论","Comments"),t("正向","Positive"),t("负向","Negative"),t("混合","Mixed"),t("中性","Neutral"),t("询问","Questions")].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{snapshot.topics.map(row=><tr key={row.id}><th><button onClick={()=>change({...scope,topic:row.id})}>{en?row.name_en:row.name_zh}</button></th><td>{row.comment_count}</td><td>{row.sentiment.positive||0}</td><td>{row.sentiment.negative||0}</td><td>{row.sentiment.mixed||0}</td><td>{row.sentiment.neutral||0}</td><td>{row.question_count}</td></tr>)}</tbody></table></div>
      <small className="aw-snapshot">{t("数据快照","Snapshot")}: {snapshot.snapshot_id.slice(0,16)}</small>
    </>}
    <section className="aw-composer"><div><h2>{t("报告与证据问答","Reports and evidence Q&A")}</h2><p>{t("报告包含判断边界与下一步核查建议。引用保留原语言，生成正文跟随界面语言。","Reports include limitations and suggested checks. Generated text follows the interface language; source quotations stay in their original language.")}</p><button disabled={!snapshot || busy || loading} onClick={()=>void generate("report")}>{busy?t("处理中…","Working…"):t("生成报告","Generate report")}</button></div>
    <form onSubmit={e=>{e.preventDefault();void generate("ask");}}><label htmlFor="aw-question">{t("你的问题","Your question")}</label><textarea id="aw-question" value={question} maxLength={1000} onChange={e=>setQuestion(e.target.value)} placeholder={t("哪些价格问题需要优先核查？","Which price issues should we investigate first?")}/><div className="aw-options"><label><input type="checkbox" checked={hyde} disabled={!capabilities?.model || busy} onChange={e=>setHyde(e.target.checked)}/>{t("HyDE 语义检索","HyDE semantic retrieval")}</label><label><input type="checkbox" checked={useModel} disabled={!capabilities?.model || busy} onChange={e=>setUseModel(e.target.checked)}/>{t("AI 撰写回答","AI-written answer")}</label></div><p className="aw-note">{t("启用 AI 会将问题和相应证据发送到已配置的模型服务。关闭时使用精确统计或证据检索。","AI sends the question and relevant evidence to your configured provider. When off, answers use exact statistics or evidence retrieval.")}</p><button disabled={!snapshot || busy || loading || question.trim().length<2}>{t("提问","Ask")}</button></form></section>
    {result && result.locale === locale && <article className="aw-result"><header><h2>{t("分析结果","Analysis result")}</h2><button onClick={download}>{t("下载 Markdown","Download Markdown")}</button></header><div className="aw-prose">{result.markdown.split(/\n\n+/).filter(block=>!block.startsWith(">")).map((block,i)=>block.startsWith("## ")?<h3 key={i}>{block.slice(3)}</h3>:block.startsWith("# ")?<h2 key={i}>{block.slice(2)}</h2>:<p key={i}>{block}</p>)}</div><h3>{t("原文证据","Original evidence")}</h3>{result.evidence.map((item,i)=><details key={item.id}><summary>{t("证据","Evidence")} {i+1} · {topics.find(row=>row[0]===item.topic)?.[en?2:1] || item.topic}</summary><blockquote>{item.quote}</blockquote>{item.context && <p>{t("对象依据（原文）","Target context (original)")}: {item.context}</p>}{onReview && <button onClick={()=>onReview(item.case_id,item.revision)}>{t("查看审核记录","View review record")}</button>}</details>)}</article>}
    {capabilities?.jobs && <section className="aw-jobs"><h2>{t("并行任务","Parallel tasks")}</h2><p>{t("任务范围为全部待审或已确认评论，不使用上方报告筛选。AI 结果仍需审核；评估仅对照当前审核记录，不视为独立测试集。","Jobs use all pending or confirmed comments, not the report filters above. AI results still need review. Evaluation compares current review records, not an independent test set.")}</p><div className="aw-filters"><label>{t("任务","Task")}<select value={jobKind} onChange={e=>setJobKind(e.target.value)}><option value="analysis">{t("分析待审评论","Analyze pending comments")}</option><option value="evaluation">{t("对照审核记录评估","Evaluate against reviews")}</option></select></label><label>{t("分析方式","Engine")}<select value={engine} onChange={e=>setEngine(e.target.value)}><option value="rules">{t("规则分析","Rule analysis")}</option><option value="model" disabled={!capabilities.model}>{t("文本模型","Text model")}</option></select></label><label>{t("执行方式","Execution")}<select value={execution} onChange={e=>setExecution(e.target.value)}><option value="auto">{t("自动（规则顺序，模型并行）","Auto (rules sequential, model parallel)")}</option><option value="ray">Ray</option><option value="sequential">{t("顺序处理","Sequential")}</option></select></label><label>{t("并行数量","Workers")}<input type="number" min={1} max={4} value={workers} onChange={e=>setWorkers(Number(e.target.value))}/></label><label>{t("最多评论数","Comment limit")}<input type="number" min={1} max={500} value={limit} onChange={e=>setLimit(Number(e.target.value))}/></label><label>{t("请求数 / 分钟","Requests / minute")}<input type="number" min={1} max={120} value={rpm} disabled={engine==="rules"} onChange={e=>setRpm(Number(e.target.value))}/></label><button disabled={busy || jobs.some(j=>activeStates.has(j.status)) || workers<1 || workers>4 || limit<1 || limit>500 || rpm<1 || rpm>120} onClick={()=>void task("/api/analysis/jobs",{kind:jobKind,engine,execution,workers,limit,requests_per_minute:rpm})}>{t("开始任务","Start task")}</button></div><p className="aw-note">{t("请求限速仅覆盖该任务。并行运行其他模型功能时，需为服务商总额度预留余量。","The request limit covers this job only. Reserve provider quota when other model features run at the same time.")}</p>
    <div aria-live="polite">{jobs.length===0 && <p>{t("尚无任务。","No tasks yet.")}</p>}{jobs.map(job=><article className="aw-job" key={job.id}><header><strong>{status(job.status)}</strong><span>{job.engine==="model"?t("文本模型","Text model"):t("规则分析","Rule analysis")} · {job.worker_count} {t("个工作进程","workers")}</span></header><progress max={job.total||1} value={job.completed+job.failed}/><p>{job.completed} / {job.total} {t("完成","completed")} · {job.failed} {t("失败","failed")} · {job.active_seconds.toFixed(1)} s</p>{job.evaluation && <p>{t("当前审核记录对照","Current review comparison")}: N={job.evaluation.count} · {t("准确率","Accuracy")} {job.evaluation.accuracy===null?"—":(job.evaluation.accuracy*100).toFixed(1)+"%"} · Macro-F1 {job.evaluation.macro_f1_present_classes?.toFixed(3) ?? "—"}</p>}{activeStates.has(job.status)?<button disabled={busy || job.status==="cancelling"} onClick={()=>void task("/api/analysis/jobs/"+job.id+"/cancel",{})}>{t("取消任务","Cancel task")}</button>:["interrupted","cancelled","failed","partial"].includes(job.status)?<button disabled={busy || jobs.some(j=>activeStates.has(j.status))} onClick={()=>void task("/api/analysis/jobs/"+job.id+"/resume",{})}>{t("继续未完成项","Resume unfinished items")}</button>:null}</article>)}</div></section>}
  </section>;
}
