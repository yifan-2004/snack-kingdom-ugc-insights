import { Ui } from '../../i18n/Ui';
import { ArrowUpRight, BookOpen, Database, Download, FileText, MessageSquarePlus, RefreshCw, Send, Sparkles, Square } from 'lucide-react'
import { FormEvent, Fragment, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext'
import { apiGet, apiPost } from '../../lib/api'
import { saveReportAsDocument } from '../../lib/reportExport'
import type { Platform, RagAnswer, RagIndexStatus } from '../../lib/types'

const suggestions = ['顾客最常提到的问题是什么？', '正面体验主要来自哪些方面？', '排队问题出现在哪些帖子里？']
const conversationStorageKey = 'snack-ugc-rag-conversations-v1'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  answer?: RagAnswer
}

type Conversation = {
  id: string
  title: string
  messages: ChatMessage[]
  updatedAt: number
  locale?: 'zh-CN' | 'en'
}

function createConversation(locale: 'zh-CN' | 'en' = 'zh-CN'): Conversation {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return { id, title: locale === 'en' ? 'New conversation' : '新对话', messages: [], updatedAt: Date.now(), locale }
}

function loadConversations(): Conversation[] {
  try {
    const value = localStorage.getItem(conversationStorageKey)
    const parsed = value ? JSON.parse(value) : []
    if (!Array.isArray(parsed)) return [createConversation()]
    const valid = parsed.filter((item): item is Conversation => item && typeof item.id === 'string' && Array.isArray(item.messages))
    return valid.length ? valid.slice(0, 30) : [createConversation()]
  } catch { return [createConversation()] }
}

function saveConversations(conversations: Conversation[]) {
  try { localStorage?.setItem(conversationStorageKey, JSON.stringify(conversations.slice(0, 30))) }
  catch { /* Local browser storage is optional for the desktop web view. */ }
}

function inlineMarkdown(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) =>
    part.startsWith('**') && part.endsWith('**')
      ? <Ui as="strong" key={index}>{part.slice(2, -2)}</Ui>
      : <Fragment key={index}>{part}</Fragment>,
  )
}

function AnswerContent({ text }: { text: string }) {
  return <Ui as="div" data-original className="rag-answer-copy">{text.split('\n').map((rawLine, index) => {
    const line = rawLine.trim()
    if (!line) return <Ui as="span" className="rag-answer-space" key={index} aria-hidden="true" />
    if (line.startsWith('### ')) return <Ui as="h3" key={index}>{inlineMarkdown(line.slice(4))}</Ui>
    if (line.startsWith('## ')) return <Ui as="h3" key={index}>{inlineMarkdown(line.slice(3))}</Ui>
    if (line.startsWith('- ')) return <Ui as="p" className="rag-answer-item" key={index}>{inlineMarkdown(line.slice(2))}</Ui>
    if (line.startsWith('> ')) return <Ui as="aside" key={index}>{inlineMarkdown(line.slice(2))}</Ui>
    return <Ui as="p" key={index}>{inlineMarkdown(line)}</Ui>
  })}</Ui>
}

export function RagPage({ selectedPostIds = [], onSelectPosts }: { selectedPostIds?: string[]; onSelectPosts?: () => void }) {
  const { language } = useLanguage()
  useEffect(() => { reportController.current?.abort(); setReport(''); setReportProgress(0) }, [language])
  const [status, setStatus] = useState<RagIndexStatus | null>(null)
  const [question, setQuestion] = useState('')
  const [platform, setPlatform] = useState<Platform | ''>('')
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [building, setBuilding] = useState(false)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'report' | 'ask'>('report')
  const [report, setReport] = useState('')
  const [reportProgress, setReportProgress] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [savingDoc, setSavingDoc] = useState(false)
  const [docMessage, setDocMessage] = useState<string | null>(null)
  const reportController = useRef<AbortController | null>(null)
  const visibleConversations = useMemo(() => conversations.filter(item => (item.locale ?? 'zh-CN') === language), [conversations, language])
  useEffect(() => {
    const existing = conversations.find(item => (item.locale ?? 'zh-CN') === language)
    if (existing) setActiveConversationId(existing.id)
    else {
      const next = createConversation(language)
      setConversations(current => [next, ...current].slice(0, 30)); setActiveConversationId(next.id)
    }
  }, [language]) // eslint-disable-line react-hooks/exhaustive-deps
  const activeConversation = useMemo(
    () => visibleConversations.find((item) => item.id === activeConversationId) ?? visibleConversations[0],
    [activeConversationId, visibleConversations],
  )
  const messages = activeConversation?.messages ?? []
  const latestAnswer = [...messages].reverse().find((item) => item.role === 'assistant')?.answer

  useEffect(() => {
    const controller = new AbortController()
    apiGet<RagIndexStatus>('/api/rag/status', controller.signal)
      .then(setStatus)
      .catch((reason) => setError((reason as Error).message))
      .finally(() => setLoadingStatus(false))
    return () => controller.abort()
  }, [])

  useEffect(() => {
    saveConversations(conversations)
  }, [conversations])

  function updateActiveConversation(update: (conversation: Conversation) => Conversation) {
    if (!activeConversation) return
    setConversations((current) => current.map((item) => item.id === activeConversation.id ? update(item) : item).sort((a, b) => b.updatedAt - a.updatedAt))
  }

  function newConversation() {
    const next = createConversation(language)
    setConversations((current) => [next, ...current].slice(0, 30))
    setActiveConversationId(next.id)
    setQuestion('')
    setError(null)
  }

  async function rebuild() {
    setBuilding(true); setError(null)
    try { setStatus(await apiPost<RagIndexStatus>('/api/rag/index')) }
    catch (reason) { setError((reason as Error).message) }
    finally { setBuilding(false) }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const value = question.trim()
    if (!value || !status?.ready || status.stale || !selectedPostIds.length) return
    setAsking(true); setError(null)
    try {
      const answer = await apiPost<RagAnswer>('/api/rag/ask', {
        question: value,
        top_k: 8,
        platform: platform || null,
        post_ids: selectedPostIds,
        locale: language,
        history: messages.slice(-12).map((message) => ({ role: message.role, content: message.content })),
      })
      const userMessage: ChatMessage = { id: `${Date.now()}-user`, role: 'user', content: value }
      const assistantMessage: ChatMessage = { id: `${Date.now()}-assistant`, role: 'assistant', content: answer.answer, answer }
      updateActiveConversation((conversation) => ({
        ...conversation,
        title: conversation.messages.length ? conversation.title : value.slice(0, 22),
        messages: [...conversation.messages, userMessage, assistantMessage],
        updatedAt: Date.now(),
      }))
      setQuestion('')
    } catch (reason) { setError((reason as Error).message) }
    finally { setAsking(false) }
  }

  async function generateReport() {
    if (!selectedPostIds.length) return
    reportController.current?.abort()
    const controller = new AbortController()
    reportController.current = controller
    setGenerating(true); setError(null); setReport(''); setReportProgress(10); setDocMessage(null)
    try {
      const response = await fetch('/api/reports/stream', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ post_ids: selectedPostIds,
        locale: language, label: `手动选择 ${selectedPostIds.length} 篇帖子` }),
      })
      if (!response.ok || !response.body) throw new Error((await response.json().catch(() => ({}))).detail || '报告生成失败')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
        const lines = buffer.split('\n'); buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          const event = JSON.parse(line) as { type: string; text?: string }
          if (event.type === 'meta') setReportProgress(30)
          if (event.type === 'delta' && event.text) { setReport((current) => current + event.text); setReportProgress((current) => Math.min(95, current + 1)) }
          if (event.type === 'done') setReportProgress(100)
        }
        if (done) break
      }
    } catch (reason) {
      if (!controller.signal.aborted) setError((reason as Error).message)
    } finally { if (!controller.signal.aborted) setGenerating(false) }
  }

  function cancelReport() { reportController.current?.abort(); setGenerating(false); setError('报告生成已中止') }

  async function saveReportDoc() {
    if (!report.trim()) return
    setSavingDoc(true); setError(null); setDocMessage(null)
    try {
      const filename = await saveReportAsDocument(report, '零食王国舆情报告')
      setDocMessage(`已保存到本地 data/reports/ 并开始下载：${filename}`)
    } catch (reason) { setError((reason as Error).message) }
    finally { setSavingDoc(false) }
  }

  const readyLabel = status?.ready ? `${status.indexed_posts} 篇帖子` : '知识库尚未建立'
  return <Ui as="div" className="page rag-page">
    <Ui as="header" className="page-header rag-header"><Ui as="div"><Ui as="h1">报告&问答</Ui><Ui as="p">同一批帖子既可以按固定结构生成运营报告，也可以自由提问。</Ui></Ui><Ui as="button" className="primary-button" type="button" onClick={onSelectPosts}>选择帖子</Ui></Ui>

    <Ui as="section" className="report-scope-strip"><Ui as="div"><FileText size={18} /><Ui as="span">{selectedPostIds.length ? `已选择 ${selectedPostIds.length} 篇帖子` : '尚未选择帖子'}</Ui></Ui><Ui as="p">报告和问答仅基于所选帖子的内容与评论。</Ui><Ui as="button" className="text-button" type="button" onClick={onSelectPosts}>{selectedPostIds.length ? '重新选择' : '去选择'}</Ui></Ui>
    <Ui as="div" className="report-mode-tabs" role="tablist" aria-label="报告与问答模式"><Ui as="button" role="tab" aria-selected={mode === 'report'} onClick={() => setMode('report')}>生成报告</Ui><Ui as="button" role="tab" aria-selected={mode === 'ask'} onClick={() => setMode('ask')}>只问问题</Ui></Ui>

    {mode === 'report' ? <Ui as="section" className="report-generator"><Ui as="div" className="report-generator-head"><Ui as="div"><Ui as="h2">运营洞察报告</Ui><Ui as="p">样本质量、情绪与平台差异、内容主题、运营亮点、风险问题、行动建议和结论边界。</Ui></Ui>{generating ? <Ui as="button" className="danger-button" type="button" onClick={cancelReport}><Square size={14} />中止生成</Ui> : <Ui as="button" className="primary-button" type="button" disabled={!selectedPostIds.length} onClick={() => void generateReport()}><Sparkles size={16} />开始生成</Ui>}{report && !generating && reportProgress === 100 ? <Ui as="button" className="text-button save-doc-button" type="button" disabled={savingDoc} onClick={() => void saveReportDoc()}><Download size={15} />{savingDoc ? '导出中…' : '保存为文档'}</Ui> : null}</Ui>{generating || reportProgress ? <Ui as="div" className="report-progress"><Ui as="div" role="progressbar" aria-label={`报告生成进度 ${reportProgress}%`} aria-valuenow={reportProgress} aria-valuemin={0} aria-valuemax={100}><Ui as="span" style={{ width: `${reportProgress}%` }} /></Ui><Ui as="small">{generating ? '正在撰写报告…' : reportProgress === 100 ? '报告生成完成' : '生成已停止'}</Ui></Ui> : null}{report ? <Ui as="article" className="rag-answer report-output"><AnswerContent text={report} />{generating ? <Ui as="span" className="type-cursor" aria-hidden="true" /> : null}</Ui> : <Ui as="div" className="report-empty">选择帖子，了解顾客关心的问题、品牌反馈和可采取的行动。</Ui>}{docMessage ? <Ui as="p" className="form-message" role="status">{docMessage}</Ui> : null}{error ? <Ui as="p" className="form-message rag-error" role="alert">{error}</Ui> : null}</Ui> : <>

    <Ui as="section" className="rag-status-strip" aria-label="知识库状态">
      <Ui as="div" className="rag-status-icon"><Database size={20} /></Ui>
      <Ui as="div"><Ui as="span">{loadingStatus ? '正在读取知识库…' : readyLabel}</Ui><Ui as="small">{status?.ready ? `${status.indexed_chunks} 个证据块 · ${status.embedding_model} · ${status.execution_engine === 'ray' ? `Ray × ${status.parallelism}` : '串行模式'}` : `${status?.source_packets ?? 0} 份安全 JSON 等待索引`}</Ui></Ui>
      {!loadingStatus && (!status?.ready || status.stale) ? <Ui as="button" className="text-button" type="button" onClick={() => void rebuild()} disabled={building}><RefreshCw size={14} className={building ? 'spin' : ''} />{building ? '更新中…' : status?.ready ? '更新知识库' : '建立知识库'}</Ui> : null}
    </Ui>

    <Ui as="div" className="rag-workspace">
      <Ui as="aside" className="rag-conversations" aria-label="对话列表">
        <Ui as="button" className="new-chat-button" type="button" onClick={newConversation}><MessageSquarePlus size={16} />新建对话</Ui>
        <Ui as="div" className="conversation-list">{visibleConversations.map((conversation) => <Ui as="button" key={conversation.id} type="button" className={conversation.id === activeConversation?.id ? 'active' : ''} onClick={() => { setActiveConversationId(conversation.id); setError(null) }}><Ui as="strong">{conversation.title}</Ui><Ui as="small">{conversation.messages.length ? `${Math.ceil(conversation.messages.length / 2)} 轮对话` : '尚未提问'}</Ui></Ui>)}</Ui>
      </Ui>
      <Ui as="section" className="rag-chat">
        <Ui as="div" className="rag-chat-intro"><Sparkles size={22} /><Ui as="div"><Ui as="h2">{activeConversation?.title || '新对话'}</Ui><Ui as="p">每次追问会保留本轮上下文，并重新检索所选帖子中的证据。</Ui></Ui></Ui>
        {!messages.length ? <Ui as="div" className="rag-suggestions">{suggestions.map((value) => <Ui as="button" key={value} type="button" onClick={() => setQuestion(value)}>{value}</Ui>)}</Ui> : null}
        <Ui as="div" className="rag-message-list">{messages.map((message) => message.role === 'user' ? <Ui as="article" className="rag-message rag-message-user" key={message.id}><Ui as="span">你</Ui><Ui as="p" data-original>{message.content}</Ui></Ui> : <Ui as="article" className="rag-message rag-message-assistant" key={message.id}><Ui as="span">知识库回答</Ui><AnswerContent text={message.content} /><Ui as="small">检索了 {message.answer?.retrieved_chunks ?? 0} 个相关证据块</Ui></Ui>)}</Ui>
        {asking ? <Ui as="article" className="rag-message rag-message-assistant rag-typing"><Ui as="span">知识库回答</Ui><Ui as="p" className="rag-typing-line">正在检索证据并撰写回答<Ui as="span" className="type-cursor" aria-hidden="true" /></Ui></Ui> : null}
        {error ? <Ui as="p" className="form-message rag-error" role="alert">{error}</Ui> : null}
        <Ui as="form" className="rag-composer" onSubmit={(event) => void submit(event)}>
          <Ui as="label" className="sr-only" htmlFor="rag-question">向知识库提问</Ui>
          <Ui as="textarea" id="rag-question" aria-label="向知识库提问" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={!selectedPostIds.length ? '请先选择帖子' : status?.stale ? '请先更新知识库' : status?.ready ? '例如：顾客对零食王国最不满意的地方是什么？' : '请先建立知识库'} disabled={!status?.ready || status.stale || !selectedPostIds.length || asking} rows={3} />
          <Ui as="div"><Ui as="select" aria-label="限定平台" value={platform} onChange={(event) => setPlatform(event.target.value as Platform | '')}><Ui as="option" value="">全部平台</Ui><Ui as="option" value="xhs">小红书</Ui><Ui as="option" value="douyin">抖音</Ui></Ui><Ui as="button" className="primary-button" type="submit" aria-label="发送问题" disabled={!status?.ready || status.stale || !selectedPostIds.length || asking || !question.trim()}>{asking ? '检索回答中…' : <><Send size={16} />发送问题</>}</Ui></Ui>
        </Ui>
      </Ui>

      <Ui as="aside" className="rag-sources" aria-label="回答来源">
        <Ui as="header"><BookOpen size={18} /><Ui as="div"><Ui as="h2">证据来源</Ui><Ui as="p">点击可查看平台原帖</Ui></Ui></Ui>
        {latestAnswer?.sources.length ? <Ui as="div" className="rag-source-list">{latestAnswer.sources.map((source, index) => <Ui as="a" key={source.post_id} href={source.source_url} target="_blank" rel="noreferrer"><Ui as="span">{String(index + 1).padStart(2, '0')}</Ui><Ui as="div"><Ui as="strong" data-original>{source.title}</Ui><Ui as="small">{source.platform === 'xhs' ? '小红书' : '抖音'} · 匹配 {source.matched_chunks} 条证据 · {(source.score * 100).toFixed(0)}%</Ui><Ui as="p" data-original>{source.excerpt}</Ui></Ui><ArrowUpRight size={15} /></Ui>)}</Ui> : <Ui as="div" className="rag-source-empty"><BookOpen size={28} /><Ui as="p">提出问题后，这里会显示当前对话最近一轮被引用的帖子和证据片段。</Ui></Ui>}
      </Ui>
    </Ui></>}
  </Ui>
}
