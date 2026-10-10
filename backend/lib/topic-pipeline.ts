export type TopicDefinition = {
  id: string;
  parentId: string | null;
  name: string;
  description: string;
  aliases: string[];
  keywords: string[];
};

export type CleanedContent = {
  rawText: string;
  normalizedText: string;
  hashtags: string[];
  emojiSignals: string[];
  flags: string[];
  isValid: boolean;
  isCommercial: boolean;
  qualityScore: number;
  cleaningVersion: string;
};

export type ExtractedAspect = {
  topicId: string | null;
  rawTopic: string;
  evidenceText: string;
  normalizedText: string;
  sentiment: "positive" | "neutral" | "negative";
  sentimentScore: number;
  confidence: number;
  matchScore: number;
  assignmentStatus: "matched" | "candidate";
};

export const CLEANING_VERSION = "clean-v5";
export const TOPIC_VERSION = "topic-v1";
export const PIPELINE_VERSION = "pipeline-v5";

const parentTopics: TopicDefinition[] = [
  {
    id: "product_experience",
    parentId: null,
    name: "产品体验",
    description: "产品口味、口感、新鲜度与品类体验",
    aliases: [],
    keywords: [],
  },
  {
    id: "price_value",
    parentId: null,
    name: "价格与价值",
    description: "价格、份量、折扣与性价比",
    aliases: [],
    keywords: [],
  },
  {
    id: "health_ingredients",
    parentId: null,
    name: "配料与健康",
    description: "热量、添加剂、配料与食品安全",
    aliases: [],
    keywords: [],
  },
  {
    id: "packaging",
    parentId: null,
    name: "包装与规格",
    description: "包装设计、密封、份量和规格",
    aliases: [],
    keywords: [],
  },
  {
    id: "service_experience",
    parentId: null,
    name: "服务体验",
    description: "排队、结账、员工与售后服务",
    aliases: [],
    keywords: [],
  },
  {
    id: "store_experience",
    parentId: null,
    name: "门店体验",
    description: "门店环境、卫生、拥挤和陈列",
    aliases: [],
    keywords: [],
  },
  {
    id: "purchase_channel",
    parentId: null,
    name: "购买与渠道",
    description: "购买渠道、缺货、物流和配送",
    aliases: [],
    keywords: [],
  },
  {
    id: "consumer_intention",
    parentId: null,
    name: "消费意愿",
    description: "复购、推荐、尝试或放弃购买",
    aliases: [],
    keywords: [],
  },
  {
    id: "brand_competitor",
    parentId: null,
    name: "品牌与竞品",
    description: "品牌印象、竞品和替代产品",
    aliases: [],
    keywords: [],
  },
  {
    id: "marketing",
    parentId: null,
    name: "营销传播",
    description: "广告、种草、促销和联名传播",
    aliases: [],
    keywords: [],
  },
];

const leafTopics: TopicDefinition[] = [
  topic("product_taste", "product_experience", "产品口味", [
    "好吃",
    "难吃",
    "味道",
    "口味",
    "香",
    "麻薯",
  ]),
  topic("sweetness", "product_experience", "甜度", [
    "太甜",
    "甜腻",
    "甜度",
    "不甜",
  ]),
  topic("texture", "product_experience", "产品口感", [
    "口感",
    "酥脆",
    "软糯",
    "硬",
    "黏牙",
  ]),
  topic("product_price", "price_value", "产品价格", [
    "价格",
    "贵",
    "便宜",
    "多少钱",
    "售价",
  ]),
  topic("value_for_money", "price_value", "性价比", [
    "性价比",
    "划算",
    "不值",
    "值得",
  ]),
  topic("portion_size", "packaging", "产品份量", [
    "份量",
    "分量",
    "缩水",
    "太少",
    "太多",
  ]),
  topic("packaging_design", "packaging", "包装设计", [
    "包装",
    "密封",
    "袋子",
    "盒子",
  ]),
  topic("ingredients", "health_ingredients", "配料与添加剂", [
    "配料",
    "添加剂",
    "防腐剂",
    "成分",
  ]),
  topic("calories", "health_ingredients", "热量与健康", [
    "热量",
    "卡路里",
    "健康",
    "减脂",
    "糖分",
  ]),
  topic("queue_time", "service_experience", "排队时长", [
    "排队",
    "等了",
    "等待",
    "队伍",
    "结账慢",
  ]),
  topic("staff_service", "service_experience", "员工服务", [
    "服务",
    "店员",
    "员工",
    "态度",
    "售后",
  ]),
  topic("store_crowding", "store_experience", "门店拥挤", [
    "拥挤",
    "人挤人",
    "人太多",
    "高峰期",
  ]),
  topic("store_environment", "store_experience", "门店环境", [
    "环境",
    "卫生",
    "陈列",
    "门店",
    "店里",
  ]),
  topic("availability", "purchase_channel", "库存与补货", [
    "缺货",
    "没货",
    "补货",
    "售罄",
  ]),
  topic("delivery", "purchase_channel", "物流与配送", [
    "物流",
    "配送",
    "快递",
    "到货",
  ]),
  topic("repurchase_intention", "consumer_intention", "复购意愿", [
    "复购",
    "回购",
    "再买",
    "下次还会",
    "不会再买",
  ]),
  topic("recommendation_intention", "consumer_intention", "推荐意愿", [
    "推荐",
    "安利",
    "避雷",
    "劝退",
  ]),
  topic("competitor_comparison", "brand_competitor", "竞品比较", [
    "竞品",
    "相比",
    "不如",
    "替代",
    "同款",
  ]),
  topic("promotion", "marketing", "促销与种草", [
    "促销",
    "优惠",
    "折扣",
    "种草",
    "广告",
    "直播",
  ]),
];

export const PRESET_TOPICS = [...parentTopics, ...leafTopics];
const topicById = new Map(PRESET_TOPICS.map((item) => [item.id, item]));

const emojiMap: Record<string, string> = {
  "😍": "[喜爱]",
  "🥰": "[喜爱]",
  "👍": "[认可]",
  "😋": "[好吃]",
  "😡": "[愤怒]",
  "🤬": "[愤怒]",
  "😭": "[失望]",
  "😢": "[失望]",
  "😂": "[调侃]",
};
const positiveWords = [
  "好吃",
  "很好",
  "不错",
  "喜欢",
  "推荐",
  "划算",
  "值得",
  "方便",
  "很快",
  "[喜爱]",
  "[认可]",
  "[好吃]",
];
const negativeWords = [
  "不好吃",
  "不推荐",
  "太甜",
  "太咸",
  "贵",
  "差",
  "难吃",
  "太贵",
  "不值",
  "避雷",
  "劝退",
  "太久",
  "太慢",
  "失望",
  "不会再买",
  "拥挤",
  "缺货",
  "[愤怒]",
  "[失望]",
];
const commercialPatterns = [
  /加(?:微|vx|v信)/i,
  /私信.{0,8}(?:购买|咨询|链接)/i,
  /直播间|点击链接|扫码|进群|代理招募/i,
  /(?:电话|手机|微信)[:：]?\s*[a-z0-9_-]{5,}/i,
];
const promptInjectionPatterns = [
  /ignore\s+(?:all\s+)?previous\s+instructions/i,
  /忽略(?:以上|之前|前面).{0,8}(?:指令|要求|内容)/,
  /system\s*prompt/i,
];
const meaninglessShort = new Set([
  "滴滴",
  "蹲",
  "来了",
  "看看",
  "1",
  "11",
  "哈哈",
  "呵呵",
]);

export function cleanUgcContent(value: unknown): CleanedContent {
  const rawText = String(value ?? "").slice(0, 12_000);
  const hashtags = [...rawText.matchAll(/#([^#\s]{1,40})/g)].map(
    (match) => match[1],
  );
  const emojiSignals: string[] = [];
  let normalizedText = rawText
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/https?:\/\/\S+/gi, " [链接] ");
  for (const [emoji, label] of Object.entries(emojiMap)) {
    if (normalizedText.includes(emoji)) emojiSignals.push(label);
    normalizedText = normalizedText.replaceAll(emoji, `${emoji} ${label}`);
  }
  normalizedText = normalizedText
    .replace(/([!?！？。])\1{2,}/g, "$1$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const flags: string[] = [];
  const isCommercial = commercialPatterns.some((pattern) =>
    pattern.test(normalizedText),
  );
  if (isCommercial) flags.push("commercial");
  if (promptInjectionPatterns.some((pattern) => pattern.test(normalizedText)))
    flags.push("prompt_injection");
  if (/^(?:[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+)$/u.test(rawText))
    flags.push("emoji_only");
  if (meaninglessShort.has(normalizedText)) flags.push("meaningless_short");

  const semanticLength = normalizedText
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[\p{P}\p{S}\s]/gu, "").length;
  const matchedTopic = leafTopics.some((item) =>
    item.keywords.some((keyword) => normalizedText.includes(keyword)),
  );
  const hasOpinionSignal = [...positiveWords, ...negativeWords].some(word => normalizedText.includes(word));
  if (semanticLength < 3 && hasOpinionSignal) flags.push("context_required");
  const isValid =
    Boolean(normalizedText) &&
    !flags.includes("meaningless_short") &&
    !(flags.includes("emoji_only") && !matchedTopic && !hasOpinionSignal) &&
    (!isCommercial || semanticLength >= 20) &&
    (semanticLength >= 3 || matchedTopic || hasOpinionSignal);
  const qualityScore = Math.max(
    0,
    Math.min(
      1000,
      250 +
        Math.min(400, semanticLength * 18) +
        (matchedTopic ? 200 : 0) -
        (isCommercial ? 250 : 0) -
        (flags.includes("prompt_injection") ? 200 : 0),
    ),
  );
  return {
    rawText,
    normalizedText,
    hashtags,
    emojiSignals: [...new Set(emojiSignals)],
    flags,
    isValid,
    isCommercial,
    qualityScore,
    cleaningVersion: CLEANING_VERSION,
  };
}

export function extractAspects(cleaned: CleanedContent): ExtractedAspect[] {
  if (!cleaned.isValid) return [];
  const matches = leafTopics.filter((definition) =>
    definition.keywords.some((keyword) =>
      cleaned.normalizedText.includes(keyword),
    ),
  );
  if (!matches.length) {
    const label = candidateLabel(cleaned.normalizedText);
    return label
      ? [
          {
            topicId: null,
            rawTopic: label,
            evidenceText: cleaned.normalizedText.slice(0, 500),
            normalizedText: label,
            sentiment: sentimentFor(cleaned.normalizedText).label,
            sentimentScore: sentimentFor(cleaned.normalizedText).score,
            confidence: 550,
            matchScore: 0,
            assignmentStatus: "candidate",
          },
        ]
      : [];
  }
  return matches.slice(0, 6).map((definition) => {
    const evidenceText = evidenceForTopic(cleaned.normalizedText, definition);
    const sentiment = sentimentFor(evidenceText);
    return {
      topicId: definition.id,
      rawTopic: definition.name,
      evidenceText,
      normalizedText: definition.name,
      sentiment: sentiment.label,
      sentimentScore: sentiment.score,
      confidence: sentiment.confidence,
      matchScore: 900,
      assignmentStatus: "matched",
    };
  });
}

export function topicDefinition(id: string | null | undefined) {
  return id ? topicById.get(id) : undefined;
}

export function topicSeedRows() {
  return PRESET_TOPICS.map((item) => ({
    id: item.id,
    parentId: item.parentId,
    name: item.name,
    description: item.description,
    origin: "preset",
    status: "active",
    aliasesJson: JSON.stringify(item.aliases),
    version: 1,
  }));
}

function topic(
  id: string,
  parentId: string,
  name: string,
  keywords: string[],
): TopicDefinition {
  return {
    id,
    parentId,
    name,
    description: `与“${name}”有关的用户表达`,
    aliases: keywords,
    keywords,
  };
}

function sentimentFor(text: string) {
  // Longest non-overlapping phrases prevent 好吃 inside 不好吃 counting twice.
  // This remains an explainable fallback, not calibrated model confidence.
  if (/[吗么？?]/.test(text)) return { label: "neutral" as const, score: 0, confidence: 400 };
  const occupied = new Set<number>();
  let positive = 0, negative = 0;
  const lexicon = [...positiveWords.map(word => ({word,direction:1})), ...negativeWords.map(word=>({word,direction:-1}))]
    .sort((a,b)=>b.word.length-a.word.length);
  for (const {word,direction} of lexicon) {
    let offset = text.indexOf(word);
    while (offset >= 0) {
      const positions=Array.from({length:word.length},(_,i)=>offset+i);
      if (!positions.some(i=>occupied.has(i))) {
        positions.forEach(i=>occupied.add(i));
        const prefix=text.slice(Math.max(0,offset-5),offset).replace(/(?:不但|不仅|非常)/g,"");
        const negations=(prefix.match(/不|没|未|无/g)??[]).length;
        const sign=direction*(negations%2?-1:1);
        if(sign>0)positive++;else negative++;
      }
      offset=text.indexOf(word,offset+word.length);
    }
  }
  if (positive > 0 && negative > 0)
    return { label: "neutral" as const, score: 0, confidence: 400 };
  if (positive === negative)
    return { label: "neutral" as const, score: 0, confidence: 400 };
  const direction = positive > negative ? 1 : -1;
  const distance = Math.min(1, Math.abs(positive - negative) / 2);
  return {
    label: direction > 0 ? ("positive" as const) : ("negative" as const),
    score: Math.round(direction * (650 + distance * 300)),
    confidence: Math.round(750 + distance * 200),
  };
}

function evidenceForTopic(text: string, definition: TopicDefinition) {
  const clauses = text
    .split(/(?:但是|不过|然而|可是|但|却)|[，,、。！？；\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
  const matchingClauses = clauses.filter((clause) =>
    definition.keywords.some((keyword) => clause.includes(keyword)),
  );
  if (matchingClauses.length) return matchingClauses.join("；").slice(0, 500);
  const position = definition.keywords
    .map((keyword) => text.indexOf(keyword))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  if (position === undefined) return text.slice(0, 500);
  return text.slice(Math.max(0, position - 30), Math.min(text.length, position + 60));
}

function candidateLabel(text: string) {
  // Explicit, reviewable aliases only; do not claim these are AI clustering.
  if (/停车|车位/.test(text)) return "停车便利性";
  const value = text
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[#@][^\s]+/g, "")
    .replace(/[，。！？、；：,.!?;:（）()“”"'\s]+/g, " ")
    .trim();
  return value.length >= 4 ? value.slice(0, 80) : "";
}
