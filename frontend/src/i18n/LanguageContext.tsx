import { legacyMessages } from './legacy-messages'
import { legacyPatterns } from './legacy-patterns'
import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type AppLanguage = 'zh-CN' | 'en'

const storageKey = 'snack-ugc-interface-language-v1'

const english: Record<string, string> = {
  '样本': 'Sample',
  ...legacyMessages,
  '查看知识记录': 'View knowledge record',
  '正在加载…': 'Loading…',
  '评论证据': 'Comment evidence',
  '此处展示当前已处理的评论；完整原文与属性可在知识记录中查看。': 'Processed comments are shown here. Open the knowledge record for complete sources and attributes.',
  '查看帖子原文、媒体分析、评论证据与相关主题。': 'Explore original posts, media analysis, comment evidence, and related topics.',
  '评论整理': 'Comment preparation',
  '保留原文与表情含义，关联所属帖子和回复上下文': 'Preserve text and emoji meaning, linking each comment to its post and reply context',
  '品牌属性与主题分析': 'Brand attributes and topic analysis',
  '先分析帖子，再并行分析评论；仅存疑属性进入审核': 'Analyze posts first, then comments in parallel; review only uncertain attributes',
  '报告和问答仅基于所选帖子的内容与评论。': 'Reports and answers use only the selected posts and their comments.',
  '运营洞察报告': 'Operational insights report',
  '开始生成': 'Generate',
  '正在撰写报告…': 'Writing your report…',
  '选择帖子，了解顾客关心的问题、品牌反馈和可采取的行动。': 'Select posts to explore customer concerns, brand feedback, and possible actions.',
  '请先更新知识库': 'Update the knowledge base first',

  '零食王国': 'Snack Kingdom',
  '舆情工作台': 'Insights Workbench',
  '零食王国 UGC 工作台': 'Snack Kingdom UGC Workbench',
  '主导航': 'Main navigation',
  '舆情总览': 'Overview',
  '内容洞察': 'Content Insights',
  '采集与处理': 'Collect & Process',
  '报告&问答': 'Reports & Q&A',
  '模型中心': 'Model Center',
  '本地试运行版': 'Local preview',
  '数据不离开当前设备': 'Data stays on this device',
  '界面语言': 'Interface language',
  '中文': 'Chinese',
  '英文': 'English',
  '切换界面语言': 'Change interface language',

  '基于最新完成的小红书与抖音 UGC 样本': 'Based on the latest processed XHS and Douyin UGC sample',
  '开始新分析': 'New analysis',
  '刷新报告': 'Refresh report',
  '正面': 'Positive',
  '真正中性': 'Truly neutral',
  '负面': 'Negative',
  '正面口碑': 'Positive sentiment',
  '总体结论': 'Overall finding',
  '当前意见样本的问题反馈需要优先处理': 'Issues in the current opinion sample need priority attention',
  '当前意见样本整体口碑偏正面': 'The current opinion sample is broadly positive',
  '当前意见样本正负反馈较为接近': 'Positive and negative feedback are closely balanced',
  '核心优势': 'Key strengths',
  '关键问题': 'Key issues',
  '行动建议': 'Recommended actions',
  '代表性内容': 'Representative content',
  '按正面、问题和互动价值选出，所有链接来自实际采集。': 'Selected for positive, issue, and engagement value. All links come from collected sources.',
  '查看详情': 'View details',
  '原帖': 'Source post',
  '正面代表': 'Positive example',
  '问题代表': 'Issue example',
  '高互动': 'High engagement',
  '正在读取最新舆情结果…': 'Loading the latest insights…',
  '暂时无法读取数据': 'Unable to load data',
  '重新加载': 'Reload',
  '还没有可展示的舆情报告': 'No insight report is available yet',
  '先采集小红书和抖音内容，再手动发起一次 AI 分析。': 'Collect XHS and Douyin content, then start an AI analysis.',
  '开始采集': 'Start collection',

  '查看已经清洗的帖子摘要、媒体理解和去重后的主要评论。': 'Review cleaned post summaries, media understanding, and deduplicated representative comments.',
  '报告数据范围': 'Report scope',
  '选择报告帖子': 'Select report posts',
  '从内容洞察中选择已处理帖子，确认后返回“报告&问答”。': 'Select processed posts, then return to Reports & Q&A.',
  '管理模式：勾选帖子后可预览并永久删除关联数据，操作不可撤销。': 'Management mode: select posts to preview and permanently delete related data. This cannot be undone.',
  '取消': 'Cancel',
  '确认选择': 'Confirm selection',
  '管理数据': 'Manage data',
  '数据管理': 'Data management',
  '完成': 'Done',
  '关键词': 'Keyword',
  '搜索帖子正文': 'Search post text',
  '平台': 'Platform',
  '全部平台': 'All platforms',
  '情感': 'Sentiment',
  '全部情感': 'All sentiment',
  '中性': 'Neutral',
  '内容': 'Content',
  '评论': 'Comments',
  '发布时间': 'Published',
  '操作': 'Actions',
  '正在筛选…': 'Filtering…',
  '没有找到符合当前条件的帖子。': 'No posts match the current filters.',
  '暂无可查看的分析报告。': 'No analysis report is available.',
  '选择当前全部帖子': 'Select all visible posts',
  '在新窗口查看原帖': 'Open source post in a new window',
  '帖子详情': 'Post details',
  '关闭详情': 'Close details',
  '正在加载完整证据…': 'Loading full evidence…',
  '打开原帖': 'Open source post',
  '帖子正文': 'Post text',
  '未提供文字正文': 'No post text provided',
  '原帖媒体': 'Source media',
  '图片与视频会生成整段媒体描述，作为这篇帖子的运营标签与检索依据。': 'Images and videos are converted into media descriptions for operational labels and retrieval.',
  '原帖视频': 'Source video',
  '原帖图片': 'Source image',
  '媒体仅保留来源记录，尚未下载。': 'Only the media source is recorded; the file has not been downloaded.',
  '帖子结论': 'Post finding',
  '查看与校正 JSON': 'Review and correct JSON',
  '主要评论': 'Representative comments',
  '匿名用户': 'Anonymous user',
  '意见': 'Opinion',
  '褒贬混合': 'Mixed opinion',
  '询问': 'Inquiry',
  '事实信息': 'Factual information',
  '社交互动': 'Social interaction',
  '离题': 'Off topic',
  '（无文字评论）': '(No comment text)',
  '人工校正': 'Manual correction',
  '收起': 'Collapse',
  '运营标签': 'Operational label',
  '内容主题（用逗号分隔）': 'Content topics (comma-separated)',
  '帖子情绪': 'Post sentiment',
  '混合': 'Mixed',
  '媒体描述': 'Media description',
  '查看当前 JSON': 'View current JSON',
  '保存并更新知识库': 'Save and update knowledge base',

  '创建一次任务后，系统会自动完成采集、处理、JSON 发布和本地知识库更新。': 'Create one task to automatically collect, process, publish JSON, and update the local knowledge base.',
  '建立自动流水线': 'Create automated pipeline',
  '双平台并行采集；评论与媒体并行下载；帖子逐篇处理并实时保存。已抓取日期会直接复用。': 'Collect both platforms in parallel, download comments and media concurrently, and process posts incrementally. Existing dates are reused.',
  '多个关键词用逗号分隔': 'Separate keywords with commas',
  '开始日期': 'Start date',
  '结束日期': 'End date',
  '开始自动采集与处理': 'Start automated collection and processing',
  '范围检查': 'Scope check',
  '帖子与评论采集': 'Post and comment collection',
  '媒体下载与持久化': 'Media download and persistence',
  '评论清洗与语义去重': 'Comment cleaning and semantic deduplication',
  '内容与情绪分析': 'Content and sentiment analysis',
  '安全 JSON 发布': 'Safe JSON publication',
  'Qwen 向量索引': 'Qwen vector indexing',
  '内容洞察发布': 'Content insights publication',
  '当前流水线': 'Current pipeline',
  '尚未创建流水线任务。': 'No pipeline task has been created.',
  '中止任务': 'Stop task',
  '从检查点继续': 'Resume from checkpoint',
  '本地入库记录': 'Local processing history',
  '正在读取本地入库记录…': 'Loading local processing history…',
  '正在读取流水线任务…': 'Loading pipeline tasks…',
  '最新 30 条本地任务记录': 'Latest 30 local task records',
  '还没有任务记录。': 'No task history yet.',
  '等待开始': 'Pending',
  '正在运行': 'Running',
  '已完成': 'Completed',
  '失败': 'Failed',
  '已中断': 'Interrupted',
  '部分完成': 'Partially completed',
  '任务已创建，等待更新': 'Task created; waiting for updates',
  '网站同步': 'Website sync',
  '重新推送全部': 'Republish all',
  '立即同步': 'Sync now',
  '正在同步…': 'Syncing…',
  '目标站点': 'Target site',
  '轻量站地址': 'Lite site URL',
  '同步令牌': 'Sync token',
  '连接配置': 'Connection settings',
  '保存': 'Save',
  '检查连接': 'Check connection',
  '自动同步': 'Automatic sync',
  '流水线发布阶段自动推送': 'Automatically push during the pipeline publish stage',
  '待同步帖子': 'Posts pending sync',
  '上次同步': 'Last sync',
  '连通性': 'Connectivity',
  '尚未配置': 'Not configured',
  '尚未同步过': 'Never synced',
  '尚未检查': 'Not checked',
  '开源爬虫 · 每日自动采集': 'Open-source crawler · Daily collection',
  '立即采集': 'Collect now',
  '正在采集…': 'Collecting…',
  '爬虫安装': 'Crawler installation',
  '已就绪': 'Ready',
  '未安装': 'Not installed',
  '平台登录': 'Platform login',
  '每日自动采集': 'Daily automatic collection',
  '采集时间': 'Collection time',
  '上次采集': 'Last collection',
  '尚未运行过': 'Never run',

  '同一批帖子既可以按固定结构生成运营报告，也可以自由提问。': 'Generate a structured operations report or ask questions about the same selected posts.',
  '选择帖子': 'Select posts',
  '尚未选择帖子': 'No posts selected',
  '报告和问答都只使用所选帖子的安全 JSON。': 'Reports and answers use only the safe JSON for selected posts.',
  '重新选择': 'Reselect',
  '去选择': 'Select now',
  '生成报告': 'Generate report',
  '只问问题': 'Ask questions',
  '报告与问答模式': 'Report and Q&A mode',
  '固定格式': 'Structured format',
  '企业运营洞察报告': 'Business Operations Insight Report',
  '样本质量、情绪与平台差异、内容主题、运营亮点、风险问题、行动建议和结论边界。': 'Sample quality, sentiment and platform differences, themes, strengths, risks, actions, and conclusion boundaries.',
  '流式生成报告': 'Stream report',
  '中止生成': 'Stop generation',
  '保存为文档': 'Save as document',
  '导出中…': 'Exporting…',
  'AI 正在流式撰写…': 'AI is writing the report…',
  '报告生成完成': 'Report complete',
  '生成已停止': 'Generation stopped',
  '选择帖子后生成，正文不会混入引用编号；原帖证据在问答结果中独立展示。': 'Select posts to generate a report. Citations are shown separately from the report body.',
  '知识库尚未建立': 'Knowledge base not built',
  '正在读取知识库…': 'Loading knowledge base…',
  '更新知识库': 'Update knowledge base',
  '建立知识库': 'Build knowledge base',
  '运行20题压力测试': 'Run 20-question stress test',
  '20题测试中…': 'Running 20-question test…',
  '新建对话': 'New conversation',
  '新对话': 'New conversation',
  '尚未提问': 'No questions yet',
  '每次追问会保留本轮上下文，并重新检索所选帖子中的证据。': 'Follow-up questions keep the conversation context and retrieve evidence again from selected posts.',
  '你': 'You',
  '知识库回答': 'Knowledge base answer',
  '正在检索证据并撰写回答': 'Retrieving evidence and writing an answer',
  '向知识库提问': 'Ask the knowledge base',
  '请先选择帖子': 'Select posts first',
  '请先建立知识库': 'Build the knowledge base first',
  '限定平台': 'Platform filter',
  '发送问题': 'Send question',
  '检索回答中…': 'Retrieving answer…',
  '证据来源': 'Evidence sources',
  '点击可查看平台原帖': 'Open a source post',
  '提出问题后，这里会显示当前对话最近一轮被引用的帖子和证据片段。': 'After you ask a question, cited posts and evidence from the latest answer appear here.',

  '系统的图片、视频、分析、向量、问答和报告全部使用 Qwen；帖子采集使用 TikHub。': 'Qwen powers image/video understanding, analysis, vectors, Q&A, and reports; TikHub collects posts.',
  '正在读取本机配置…': 'Loading local settings…',
  '用于图文与视频理解、JSON 生成、向量化、报告和问答。': 'Used for image and video understanding, JSON generation, embeddings, reports, and Q&A.',
  '用于小红书和抖音的帖子、评论与媒体采集。': 'Used to collect XHS and Douyin posts, comments, and media.',
  '已配置': 'Configured',
  '未配置': 'Not configured',
  '仅保存在当前设备': 'Stored only on this device',
  '正在保存…': 'Saving…',
  '已保存到本机配置。': 'Saved to local settings.',
}

const patterns: Array<[RegExp, (...groups: string[]) => string]> = [
  [/^(\d+) 篇内容$/, (count) => `${count} posts`],
  [/^(\d+) 篇已选$/, (count) => `${count} selected`],
  [/^已选择 (\d+) 篇帖子$/, (count) => `${count} posts selected`],
  [/^(\d+) 条评论$/, (count) => `${count} comments`],
  [/^(\d+) 个主题$/, (count) => `${count} themes`],
  [/^代表 (\d+) 条相似评论$/, (count) => `Represents ${count} similar comments`],
  [/^(\d+) 篇帖子$/, (count) => `${count} posts`],
  [/^(\d+) 个证据块$/, (count) => `${count} evidence chunks`],
  [/^(\d+) 轮对话$/, (count) => `${count} turns`],
  [/^选择帖子 (.+)$/, (title) => `Select post ${title}`],
  [/^打开帖子 (.+)$/, (title) => `Open post ${title}`],
  [/^任务进度 (\d+)%$/, (value) => `Task progress ${value}%`],
  [/^报告生成进度 (\d+)%$/, (value) => `Report progress ${value}%`],
]

export function translateText(value: string): string {
  const leading = value.match(/^\s*/)?.[0] ?? ''
  const trailing = value.match(/\s*$/)?.[0] ?? ''
  const trimmed = value.trim()
  if (!trimmed) return value
  const direct = english[trimmed]
  if (direct) return `${leading}${direct}${trailing}`
  for (const [pattern, replace] of [...patterns, ...legacyPatterns]) {
    const match = trimmed.match(pattern)
    if (match) return `${leading}${replace(...match.slice(1))}${trailing}`
  }
  return value
}

interface LanguageContextValue {
  language: AppLanguage
  setLanguage: (language: AppLanguage) => void
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function initialLanguage(): AppLanguage {
  try {
    return localStorage.getItem(storageKey) === 'zh-CN' ? 'zh-CN' : 'en'
  } catch {
    return 'en'
  }
}

function useDocumentLanguage(language: AppLanguage) {
  useLayoutEffect(() => { document.documentElement.lang = language }, [language])
}

export function useTextLanguage(): AppLanguage {
  return useContext(LanguageContext)?.language ?? 'en'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, updateLanguage] = useState<AppLanguage>(initialLanguage)
  useDocumentLanguage(language)
  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage: (next) => {
      updateLanguage(next)
      try { localStorage.setItem(storageKey, next) } catch { /* optional in the desktop web view */ }
    },
  }), [language])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext)
  if (!value) throw new Error('useLanguage must be used within LanguageProvider')
  return value
}
