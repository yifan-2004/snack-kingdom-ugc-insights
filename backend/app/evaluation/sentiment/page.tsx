"use client";

import { Ui } from '../../Ui';
import { useEffect, useMemo, useRef, useState } from "react";
import { parseManualReview } from "../../../lib/manual-review-import";
import Link from "next/link";
import { LanguageSwitch } from "../../LanguageSwitch";

type Sentiment = "positive" | "neutral" | "negative";
type Item = {
  id: string;
  postId: number;
  postTitle: string;
  platform: string;
  content: string;
  predicted: Sentiment;
  representedCount: number;
};
type Sample = {
  version: string;
  sampling: string;
  targetPerClass: number;
  sourcePostCount: number;
  sourceCommentRecords: number;
  excludedByKind?: Record<string, number>;
  items: Item[];
  limitations: string[];
};

const sentiments: Sentiment[] = ["positive", "neutral", "negative"];
const labels: Record<Sentiment, string> = {
  positive: "正面",
  neutral: "中性",
  negative: "负面",
};
const storageKey = "snack-kingdom-sentiment-gold-v1";

function safeDivide(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : 0;
}

export default function SentimentEvaluationPage() {
  const [sample, setSample] = useState<Sample | null>(null);
  const [gold, setGold] = useState<Record<string, Sentiment>>({});
  const [error, setError] = useState("");
  const importedRef = useRef(false);
  const [importedTotal, setImportedTotal] = useState<number | null>(null);

  async function importReview(file: File) {
    try {
      if (file.size > 2_000_000) throw new Error("评测文件不能超过2MB");
      const review = parseManualReview(await file.text());
      importedRef.current = true;
      setImportedTotal(review.total);
      setSample({version:review.version,sampling:"imported frozen review",targetPerClass:0,
        sourcePostCount:new Set(review.items.map(r=>r.postId)).size,sourceCommentRecords:review.total,
        items:review.items,limitations:["导入的是历史评测，不代表当前模型的重新测试结果。"]});
      setGold(Object.fromEntries(review.items.map(r=>[r.id,r.gold])));
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "文件读取失败"); }
  }

  useEffect(() => {
    // Restore existing human labels after hydration, without deleting or rewriting them.
    void Promise.resolve().then(() => {
      if (importedRef.current) return;
      try {
        const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}");
        if (saved && typeof saved === "object" && !Array.isArray(saved)) {
          const entries = Object.entries(saved).filter(([,value]) =>
            typeof value === "string" && sentiments.includes(value as Sentiment));
          setGold(Object.fromEntries(entries) as Record<string, Sentiment>);
        }
      } catch { /* Keep labels on disk intact; malformed storage is not a valid score. */ }
    });
    fetch("/api/evaluation/sentiment-sample")
      .then(async (response) => {
        const payload = (await response.json()) as Sample & { error?: string };
        if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
        return payload;
      })
      .then(data => { if (!importedRef.current) setSample(data); })
      .catch((reason) =>
        { if (!importedRef.current) setError(reason instanceof Error ? reason.message : String(reason)); },
      );
  }, []);

  const metrics = useMemo(() => {
    const matrix: Record<Sentiment, Record<Sentiment, number>> = {
      positive: { positive: 0, neutral: 0, negative: 0 },
      neutral: { positive: 0, neutral: 0, negative: 0 },
      negative: { positive: 0, neutral: 0, negative: 0 },
    };
    const reviewedItems = sample?.items.filter((item) => gold[item.id]) ?? [];
    for (const item of reviewedItems) {
      const actual = gold[item.id];
      if (actual) matrix[actual][item.predicted] += 1;
    }
    const perClass = sentiments.map((sentiment) => {
      const tp = matrix[sentiment][sentiment];
      const fp = sentiments
        .filter((value) => value !== sentiment)
        .reduce((sum, actual) => sum + matrix[actual][sentiment], 0);
      const fn = sentiments
        .filter((value) => value !== sentiment)
        .reduce((sum, predicted) => sum + matrix[sentiment][predicted], 0);
      const precision = safeDivide(tp, tp + fp);
      const recall = safeDivide(tp, tp + fn);
      return {
        sentiment,
        support: sentiments.reduce(
          (sum, predicted) => sum + matrix[sentiment][predicted],
          0,
        ),
        precision,
        recall,
        f1: safeDivide(2 * precision * recall, precision + recall),
      };
    });
    return {
      matrix,
      perClass,
      macroF1:
        perClass.reduce((sum, item) => sum + item.f1, 0) / perClass.length,
    };
  }, [gold, sample]);
  const reviewed = sample?.items.filter((item) => gold[item.id]) ?? [];

  const choose = (id: string, sentiment: Sentiment) => {
    setGold((current) => {
      const next = { ...current, [id]: sentiment };
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Keep the in-memory review usable when storage is unavailable.
      }
      return next;
    });
  };

  const exportLabels = () => {
    if (!sample) return;
    const payload = {
      evaluation: sample.version,
      exportedAt: new Date().toISOString(),
      reviewed: reviewed.length,
      total: importedTotal ?? sample.items.length,
      macroF1: metrics.macroF1,
      perClass: metrics.perClass,
      confusionMatrix: metrics.matrix,
      labels: sample.items
        .filter((item) => gold[item.id])
        .map((item) => ({ ...item, gold: gold[item.id] })),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json;charset=utf-8",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "sentiment-manual-evaluation.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Ui as="main" className="sentiment-eval-shell">
      <Ui as="header" className="evaluation-topbar"><LanguageSwitch />
        <Link href="/evaluation" prefetch={false} className="back-link">
          返回模型系统评估
        </Link>
        <Ui as="span">人工 gold label 工具</Ui>
      </Ui>
      <Ui as="section" className="sentiment-eval-hero">
        <Ui as="div">
          <Ui as="p" className="eyebrow">SENTIMENT GOLD SET</Ui>
          <Ui as="h1">情感分类人工评测</Ui>
          <Ui as="p">
            只对“意见型评论”的正面、中性、负面进行人工复核，询问、事实、
            社交、离题和褒贬混合信号不再强塞进中性。实时计算
            per-class Precision / Recall / F1、Macro-F1 和混淆矩阵。
          </Ui>
        </Ui>
        <Ui as="button" type="button" onClick={exportLabels} disabled={!reviewed.length}>
          导出评测 JSON
        </Ui>
        <Ui as="label">导入已完成人工评测
          <Ui as="input" type="file" accept=".json,application/json" onChange={event => {
            const file=event.target.files?.[0]; if(file) void importReview(file);
            event.target.value="";
          }} />
        </Ui>
      </Ui>

      {importedTotal !== null && <Ui as="p" className="evaluation-environment-note">
        正在查看历史评测：按文件中的原始预测和人工标签重新计算分数，不覆盖本浏览器原有标注。刷新后返回当前样本；请保留导出的文件。
      </Ui>}

      {sample && (
        <Ui as="p" className="evaluation-environment-note">
          当前情感评测排除了 {Object.values(sample.excludedByKind ?? {}).reduce((sum, value) => sum + value, 0)} 条非意见或混合信号权重；这些内容仍保留用于需求和 Topic 分析。
        </Ui>
      )}

      {error && <Ui as="p" className="evaluation-environment-error">{error}</Ui>}
      <Ui as="section" className="sentiment-metric-grid">
        <Ui as="article"><Ui as="span">已人工复核</Ui><Ui as="strong">{reviewed.length}/{importedTotal ?? sample?.items.length ?? 0}</Ui><Ui as="small">{reviewed.length > 0 && reviewed.length === (importedTotal ?? sample?.items.length) ? "本次标注已完成；结果仅适用于此评测样本" : "仅为已标注子集的结果，尚未完成全套评测"}</Ui></Ui>
        <Ui as="article"><Ui as="span">Macro-F1</Ui><Ui as="strong">{reviewed.length ? metrics.macroF1.toFixed(3) : "--"}</Ui><Ui as="small">三个类别等权平均</Ui></Ui>
        {metrics.perClass.map((item) => (
          <Ui as="article" key={item.sentiment}>
            <Ui as="span">{labels[item.sentiment]} F1</Ui>
            <Ui as="strong">{item.support ? item.f1.toFixed(3) : "--"}</Ui>
            <Ui as="small">P {item.precision.toFixed(2)} · R {item.recall.toFixed(2)} · n={item.support}</Ui>
          </Ui>
        ))}
      </Ui>

      <Ui as="section" className="confusion-card">
        <Ui as="div"><Ui as="p" className="eyebrow">CONFUSION MATRIX</Ui><Ui as="h2">混淆矩阵</Ui></Ui>
        <Ui as="table">
          <Ui as="thead"><Ui as="tr"><Ui as="th">gold \\ predicted</Ui>{sentiments.map((value) => <Ui as="th" key={value}>{labels[value]}</Ui>)}</Ui></Ui>
          <Ui as="tbody">{sentiments.map((actual) => <Ui as="tr" key={actual}><Ui as="th">{labels[actual]}</Ui>{sentiments.map((predicted) => <Ui as="td" key={predicted}>{metrics.matrix[actual][predicted]}</Ui>)}</Ui>)}</Ui>
        </Ui>
      </Ui>

      <Ui as="section" className="labeling-board">
        <Ui as="header">
          <Ui as="div"><Ui as="p" className="eyebrow">MANUAL REVIEW QUEUE</Ui><Ui as="h2">逐条标注</Ui></Ui>
          <Ui as="p">标签仅保存在本浏览器，不会改写线上舆情数据。</Ui>
        </Ui>
        <Ui as="div" className="labeling-list">
          {sample?.items.map((item, index) => (
            <Ui as="article" key={item.id} className={gold[item.id] ? "reviewed" : ""}>
              <Ui as="div" className="labeling-meta">
                <Ui as="span">#{String(index + 1).padStart(2, "0")}</Ui>
                <Ui as="span">{item.platform}</Ui>
                <Ui as="span">系统预测：{labels[item.predicted]}</Ui>
                <Ui as="span">权重 {item.representedCount}</Ui>
              </Ui>
              <Ui as="h3" data-original>{item.postTitle}</Ui>
              <Ui as="p" data-original>{item.content}</Ui>
              <Ui as="div" className="gold-buttons" aria-label={`${item.id} 人工情感标签`}>
                {sentiments.map((sentiment) => (
                  <Ui as="button" type="button" key={sentiment} disabled={importedTotal !== null} className={gold[item.id] === sentiment ? "active" : ""} onClick={() => choose(item.id, sentiment)}>
                    {labels[sentiment]}
                  </Ui>
                ))}
              </Ui>
            </Ui>
          ))}
        </Ui>
      </Ui>
    </Ui>
  );
}
