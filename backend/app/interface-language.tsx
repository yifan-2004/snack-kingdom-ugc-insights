"use client";
import { legacyMessages } from './legacy-messages';
import { legacyPatterns } from './legacy-patterns'
import { evaluationMessages } from './evaluation-messages';

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type InterfaceLanguage = "zh-CN" | "en";
const storageKey = "snack-kingdom-interface-language-v1";

const english: Record<string, string> = {
  ...legacyMessages,
  ...evaluationMessages,
  "零食王国": "Snack Kingdom",
  "舆情工作台": "Insights Workbench",
  "主要功能": "Main navigation",
  "舆情总览": "Overview",
  "内容洞察": "Content Insights",
  "报告 & 问答": "Reports & Q&A",
  "运行状态": "System Status",
  "Topic 治理": "Topic Governance",
  "界面语言": "Interface language",
  "切换界面语言": "Change interface language",
  "正在读取状态": "Loading status",
  "同步时间未知": "Sync time unknown",
  "关闭错误提示": "Dismiss error",
  "关闭": "Close",
  "先看用户在谈什么，再看每个话题的态度": "See what people discuss before judging how they feel",
  "总览以 Topic 为主线，把支持、真正中性、质疑与非意见信号放回具体问题中，避免用一个全局“中性”数字掩盖真实反馈。": "The overview puts support, truly neutral opinions, criticism, and non-opinion signals back into each Topic, so one global neutral number cannot hide real feedback.",
  "进入内容分析": "Open content analysis",
  "系统评估": "System evaluation",
  "Topic 数据摘要": "Topic summary",
  "已有反馈的 Topic": "Topics with evidence",
  "只统计已发布且有证据的话题": "Published Topics with current evidence",
  "话题提及权重": "Topic mention weight",
  "同一条反馈可讨论多个话题": "One comment may discuss multiple Topics",
  "待治理候选": "Governance candidates",
  "确认后才进入正式分析口径": "Candidates stay outside official metrics until approved",
  "当前帖子范围": "Posts in scope",
  "所有结论仅适用于当前载入范围": "Findings apply only to the loaded sample",
  "主要讨论 Topic": "Main discussion Topics",
  "态度图例": "Sentiment legend",
  "支持": "Support",
  "未明确表态": "No clear stance",
  "真正中性": "Truly neutral",
  "质疑 / 不满": "Critical / dissatisfied",
  "正在整理 Topic 与证据...": "Organizing Topics and evidence…",
  "暂无已发布 Topic 数据。请先在 Topic 治理中确认候选主题。": "No published Topic evidence yet. Review candidates in Topic Governance.",
  "优先核查": "Review first",
  "负向占比 × 讨论规模": "negative share × volume",
  "正在计算优先级...": "Calculating priority…",
  "当前没有可计算的话题证据。": "No Topic evidence can be prioritized yet.",
  "优先级是排查线索，不等同于商业结论；进入详情后仍需查看原文与来源。": "Priority is an investigation signal, not a business conclusion. Review source evidence before acting.",
  "辅助视图": "Secondary view",
  "查看整体情绪、优势问题与数据质量": "View overall sentiment, strengths, issues, and data quality",
  "筛选并查看帖子；勾选内容后生成指定范围报告或问答。": "Filter and review posts, then select a scope for reports or Q&A.",
  "搜索标题或摘要": "Search title or summary",
  "搜索帖子标题或摘要": "Search post title or summary",
  "按平台筛选": "Filter by platform",
  "全部平台": "All platforms",
  "小红书": "XHS",
  "抖音": "Douyin",
  "按情感筛选": "Filter by sentiment",
  "全部情绪": "All sentiment",
  "正面": "Positive",
  "中性": "Neutral",
  "负面": "Negative",
  "重置全部筛选条件": "Reset all filters",
  "重置": "Reset",
  "全选当前结果": "Select all results",
  "取消全选": "Clear selection",
  "查看": "View",
  "打开原帖": "Open source post",
  "帖子详情": "Post details",
  "正文": "Post text",
  "媒体与描述": "Media and description",
  "代表评论": "Representative comments",
  "暂无评论": "No comments",
  "生成运营报告": "Generate operations report",
  "证据问答": "Evidence Q&A",
  "生成报告": "Generate report",
  "正在生成…": "Generating…",
  "下载报告": "Download report",
  "向已选帖子提问": "Ask selected posts",
  "发送": "Send",
  "正在回答…": "Answering…",
  "运行 20 题测试": "Run 20-question test",
  "测试中…": "Testing…",
  "证据来源": "Evidence sources",
  "暂无问答记录": "No Q&A history",
  "系统健康": "System health",
  "数据快照": "Data snapshot",
  "数据截止": "Data cutoff",
  "最近同步": "Last sync",
  "帖子范围": "Post scope",
  "帖子数": "Posts",
  "原始评论": "Raw comments",
  "有效评论": "Valid comments",
  "意见权重": "Opinion weight",
  "非意见信号": "Non-opinion signals",
  "Topic 注册表与候选池": "Topic registry and candidate pool",
  "正式 Topic 保持稳定统计口径；未识别的高频表达先进入候选池，经 AI 建议与人工审核后再发布新版本。": "Official Topics keep a stable metric definition. Frequent unmatched expressions enter a candidate pool before AI-assisted and human review publishes a new version.",
  "正在读取 Topic 注册表…": "Loading Topic registry…",
  "正式 Topic": "Official Topics",
  "候选主题": "Topic candidates",
  "Topic 版本": "Topic version",
  "正式 Topic 统计": "Official Topic metrics",
  "提及权重": "Mention weight",
  "版本": "Version",
  "候选池": "Candidate pool",
  "尚无正式 Topic": "No official Topics yet",
  "运行 v3 数据同步后会初始化预设 Topic 注册表": "Run v3 data sync to initialize the preset Topic registry",
  "未命中预设 Topic 的有效评论会进入这里": "Valid comments unmatched to preset Topics appear here",
  "Topic 数据不可用": "Topic data unavailable",
  "请稍后刷新重试": "Refresh and try again later",
  "产品口味": "Product taste",
  "甜度": "Sweetness",
  "产品口感": "Product texture",
  "产品价格": "Product price",
  "性价比": "Value for money",
  "产品份量": "Portion size",
  "包装设计": "Packaging",
  "配料与添加剂": "Ingredients & additives",
  "热量与健康": "Calories & health",
  "排队时长": "Queue time",
  "员工服务": "Staff service",
  "门店拥挤": "Store crowding",
  "门店环境": "Store environment",
  "库存与补货": "Availability",
  "物流与配送": "Delivery",
  "复购意愿": "Repurchase intent",
  "推荐意愿": "Recommendation intent",
  "竞品比较": "Competitor comparison",
  "促销与种草": "Promotion & discovery",
};

const patterns: Array<[RegExp, (...values: string[]) => string]> = [
  [/^(\d+) 篇帖子$/, (n) => `${n} posts`],
  [/^(\d+) 篇已选帖子$/, (n) => `${n} selected posts`],
  [/^当前已加载 (\d+) 篇帖子$/, (n) => `${n} posts loaded`],
  [/^(\d+) 次提及权重$/, (n) => `${n} mention weight`],
  [/^(\d+) 条询问\/事实另计$/, (n) => `${n} inquiry/factual signals excluded`],
  [/^负向 (\d+)%$/, (n) => `Negative ${n}%`],
  [/^正向 (\d+)%$/, (n) => `Positive ${n}%`],
  [/^(\d+) 条负向权重 \/ (\d+) 条话题态度$/, (a, b) => `${a} negative / ${b} Topic opinions`],
  [/^最近同步 (.+)$/, (value) => `Last synced ${value}`],
];

export function translateText(value: string) {
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (english[trimmed]) return `${leading}${english[trimmed]}${trailing}`;
  for (const [pattern, replace] of [...patterns, ...legacyPatterns]) {
    const match = trimmed.match(pattern);
    if (match) return `${leading}${replace(...match.slice(1))}${trailing}`;
  }
  return value;
}

const LanguageContext = createContext<{
  language: InterfaceLanguage;
  setLanguage: (language: InterfaceLanguage) => void;
} | null>(null);

function readLanguage(): InterfaceLanguage {
  try { return localStorage.getItem(storageKey) === "zh-CN" ? "zh-CN" : "en"; }
  catch { return "en"; }
}

function useDocumentLanguage(language: InterfaceLanguage) {
  useLayoutEffect(() => { document.documentElement.lang = language; }, [language]);
}

export function useTextLanguage(): InterfaceLanguage {
  return useContext(LanguageContext)?.language ?? "en";
}

export function InterfaceLanguageProvider({ children }: { children: ReactNode }) {
  const language = useSyncExternalStore(subscribeLanguage, readLanguage, () => "en" as InterfaceLanguage);
  useDocumentLanguage(language);
  const value = useMemo(() => ({
    language,
    setLanguage: (next: InterfaceLanguage) => {
      try { localStorage.setItem(storageKey, next); } catch { /* optional preference */ }
      window.dispatchEvent(new Event("snack-language-change"));
    },
  }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

function subscribeLanguage(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener("snack-language-change", notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener("snack-language-change", notify);
  };
}

export function useInterfaceLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useInterfaceLanguage must be used inside InterfaceLanguageProvider");
  return value;
}
