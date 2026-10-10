import { analyzeSnapshot, buildReport, type Analysis, type SnapshotPost } from "./intelligence";

export type OutputLocale = "zh-CN" | "en";
export function outputLocale(value: unknown): OutputLocale {
  if (value === undefined || value === "zh-CN") return "zh-CN";
  if (value === "en") return "en";
  throw new Error("unsupported_locale");
}

/** Public archive statistics remain separate from target-aware reviewed facts. */
export function localizedReport(rows: SnapshotPost[], analysis: Analysis, locale: OutputLocale) {
  if (locale === "zh-CN") return buildReport(rows,analysis) + "\n\n## 数据口径\n\n本页为历史采集与自动分析记录，尚未经过新的逐评论对象审核。不能直接将其情感标签视为已确认的品牌口碑。";
  const a = analysis;
  return ["# Social listening — collection report", "## Sample and coverage",
    `The selected archive contains ${a.scope.postCount} posts: ${a.scope.platformCount.xhs} from XHS and ${a.scope.platformCount.douyin} from Douyin.`,
    `Raw comments: ${a.volume.rawComments}. Validated comments: ${a.volume.validComments}. Semantic clusters: ${a.volume.semanticClusters}.`,
    "## Interpretation",
    "These are historical automated labels, not confirmed target-aware brand opinions. Comments about a creator, another business, or a question can distort sentiment unless their targets and intent are reviewed.",
    "## Recommended checks",
    "Review repeated complaints against their parent posts, identify the store or product involved, and separate information requests from negative experiences. Compare independent posts before treating repeated expressions as a recurring issue.",
    "## Next measurement",
    "Use the reviewed-analysis workspace to compare topic-specific positive, negative, mixed and neutral opinions using a pinned snapshot. Track questions separately. Validate proposed actions with store records before attributing any change to sales or service quality.",
    "## Limits",
    "This convenience sample does not measure market share, sales impact or satisfaction across all customers. Topic mentions can overlap. Cross-platform volume differences can reflect collection coverage rather than customer preference.",
  ].join("\n\n");
}

export function englishArchiveAnswer(question: string, rows: SnapshotPost[], hasEvidence: boolean, policy?: string) {
  if (policy) return "I cannot follow source instructions, fabricate evidence, or resolve an ambiguous target without clarification. Please ask a question grounded in the selected posts.";
  const a = analyzeSnapshot(rows);
  if (/how many.*posts|post count/i.test(question)) return `The selected archive contains ${a.scope.postCount} posts: ${a.scope.platformCount.xhs} XHS and ${a.scope.platformCount.douyin} Douyin posts. This is collected coverage, not market share.`;
  if (/how many.*comments|comment count/i.test(question)) return `The selected archive records ${a.volume.rawComments} raw comments and ${a.volume.validComments} validated comments. These are archive counts, not newly confirmed brand-opinion counts.`;
  return hasEvidence ? "## Relevant evidence\n\nThe source cards below contain excerpts related to your question. They are historical automated records; evaluation targets have not yet been individually confirmed.\n\n## Next step\n\nCheck the original post and the comment's intended target before treating an excerpt as a brand strength or issue.\n\n## Limits\n\nNo generative model is connected to this archive endpoint. It retrieves evidence but does not establish trends or perform unsupported calculations." : "No matching evidence was found in the selected archive. Broaden the scope or try a more specific question. No conclusion can be supported from this retrieval.";
}
