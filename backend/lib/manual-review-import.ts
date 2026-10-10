type Sentiment = "positive" | "neutral" | "negative";
export function parseManualReview(text: string) {
  if (new TextEncoder().encode(text).length > 2_000_000) throw new Error("评测文件不能超过2MB");
  const data = JSON.parse(text);
  const valid = (v: unknown): v is Sentiment => typeof v === "string" && ["positive", "neutral", "negative"].includes(v);
  if (!data || !Array.isArray(data.labels) || !data.labels.length || data.labels.length > 2000 ||
      !Number.isSafeInteger(data.total) || data.total < data.labels.length || data.total > 2000 ||
      typeof data.evaluation !== "string" || data.evaluation.length > 200)
    throw new Error("请导入本页面导出的评测JSON，包含evaluation、total和labels");
  const ids = new Set<string>();
  const items = (data.labels as Record<string, unknown>[]).map((row) => {
    if (!row || typeof row.id !== "string" || !row.id || row.id.length > 200 || ids.has(row.id) ||
        !valid(row.gold) || !valid(row.predicted) || typeof row.content !== "string" || row.content.length > 12000 ||
        typeof row.postTitle !== "string" || row.postTitle.length > 1000 || typeof row.platform !== "string" || row.platform.length > 40 ||
        !Number.isSafeInteger(row.postId) || !Number.isSafeInteger(row.representedCount) || Number(row.representedCount) < 1)
      throw new Error("评测记录缺失、重复或标签不合法，未导入任何数据");
    ids.add(row.id);
    return {id:row.id,postId:Number(row.postId),postTitle:row.postTitle,platform:row.platform,
      content:row.content,predicted:row.predicted,gold:row.gold,representedCount:Number(row.representedCount)};
  });
  // Never trust imported aggregate scores. The page recomputes them from rows.
  return {version:data.evaluation as string,total:data.total as number,items};
}
