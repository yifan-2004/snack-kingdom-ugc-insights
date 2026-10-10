/**
 * Fictional examples for repository previews and automated tests.
 * No collected user content, account handles or historical measurements.
 */
const date = '2026-06-01T12:00:00Z'
const ratio = { positive: 2 / 3, neutral: 0, negative: 1 / 3 }
const comments = [
  { id: 'demo-c1', post_id: 'demo-p1', text: 'The queue took thirty minutes.', topic: 'queue_time', sentiment: 'negative', likes: 3 },
  { id: 'demo-c2', post_id: 'demo-p1', text: 'When is the queue shortest?', topic: 'queue_time', sentiment: null, likes: 2 },
  { id: 'demo-c3', post_id: 'demo-p2', text: 'The snacks taste great!', topic: 'product_taste', sentiment: 'positive', likes: 4 },
  { id: 'demo-c4', post_id: 'demo-p2', text: 'I enjoyed the spicy snacks.', topic: 'product_taste', sentiment: 'positive', likes: 1 },
]
const posts = [
  { post_id: 'demo-p1', title: 'Snack Kingdom store visit', body_text: 'I visited Snack Kingdom on a busy afternoon. The queue took thirty minutes.', topic: 'queue_time', label: 'negative', likes: 8 },
  { post_id: 'demo-p2', title: 'Trying Snack Kingdom snacks', body_text: 'I enjoyed the taste of the spicy snacks at Snack Kingdom.', topic: 'product_taste', label: 'positive', likes: 10 },
]
const names: Record<string, string> = { queue_time: 'Queue time', product_taste: 'Product taste' }
export const demoOverview = {
  demo: true,
  job_id: 'processed', status: 'completed', created_at: date, completed_at: date,
  sample_size: 2, comment_count: 4, platform_count: { xhs: 2, douyin: 0 },
  weighted_ratio: ratio, raw_ratio: ratio, opinion_weight: 3, non_opinion_weight: 1,
  mixed_opinion_weight: 0, intent_count: { opinion: 3, inquiry: 1 },
  topics: Object.keys(names).map(id => {
    const rows = comments.filter(c => c.topic === id)
    const opinion = rows.filter(c => c.sentiment)
    const count = { positive: opinion.filter(c => c.sentiment === 'positive').length, neutral: 0, negative: opinion.filter(c => c.sentiment === 'negative').length }
    const postLikes = posts.filter(p => p.topic === id).reduce((sum, p) => sum + p.likes, 0)
    const commentLikes = rows.reduce((sum, c) => sum + c.likes, 0)
    return { id, name: names[id], name_en: names[id], represented_mentions: 3,
      opinion_mentions: opinion.length, non_opinion_mentions: rows.length - opinion.length,
      mixed_opinion_mentions: 0, sentiment_count: count,
      sentiment_ratio: { positive: count.positive / opinion.length, neutral: 0, negative: count.negative / opinion.length },
      negative_priority: count.negative, post_count: 1, comment_count: 2, discussion_score: 3,
      like_count: postLikes + commentLikes, post_likes: postLikes, comment_likes: commentLikes }
  }),
  topic_mentions: 6, topic_candidates: [],
  summary: 'Fictional sample: queue-time criticism and positive product-taste feedback.',
  strengths: ['Positive taste feedback'], problems: ['Long queue'], actions: ['Investigate peak-hour waiting times'],
  representative_posts: [],
}
export const demoCorpus = {
  schema_version: 1,
  source: { sample_size: 2, comment_count: 4, completed_at: date },
  documents: [
    ...posts.map(p => ({ id: p.post_id, post_id: p.post_id, title: p.title, platform: 'xhs', source_url: '', kind: 'post', text: p.body_text, topic_ids: [p.topic], sentiment: p.label })),
    ...comments.map(c => ({ id: c.id, post_id: c.post_id, title: posts.find(p => p.post_id === c.post_id)!.title, platform: 'xhs', source_url: '', kind: 'comment', text: c.text, description: c.text, target: 'brand', topic_ids: [c.topic], sentiment: c.sentiment ?? 'unrelated' })),
  ],
}
export const demoQueue = {
  posts: 2, comments: 4, total: 1, legacy_posts: 0,
  items: [{
    post_id: 'demo-p1', post_title: posts[0].title, comment_id: 'demo-c2',
    packet_hash: 'demo-packet-v1',
    raw_text: comments[1].text,
    context: { post_text: posts[0].body_text, parent_text: '' },
    attributes: { target: 'brand', relevance: 'related', sentiment: 'neutral', description: 'Question about quiet visiting hours', evidence: [comments[1].text], is_question: true },
    review_reasons: ['Question without a clear brand opinion'],
  }],
}
const chart = {
  scatter: demoOverview.topics.map(t => ({ id: t.id, name: t.name, name_en: t.name_en, mentions: t.represented_mentions, likes: t.like_count, negative_ratio: t.sentiment_ratio.negative })),
  timeline: demoOverview.topics.map(t => ({ date: '2026-06-01', topic_id: t.id, mentions: t.represented_mentions, ...t.sentiment_count, mixed: 0 })),
  missing_dates: 0, new_posts_pending: 0, new_comments_pending: 0, collected_posts: 2, collected_comments: 4, updated_at: date,
}
const charts = { day: chart, week: chart, month: chart }
const detail = (p: typeof posts[number]) => ({
  ...p, platform: 'xhs', canonical_url: '', published_at: date,
  author: { nickname: 'Sample customer', profile_url: null }, retrieved_comment_count: 2,
  analysis_status: 'completed', overall_label: p.label, overall_score: null,
  raw_distribution: p.label === 'positive' ? { positive: 1, neutral: 0, negative: 0 } : { positive: 0, neutral: 0, negative: 1 },
  weighted_distribution: p.label === 'positive' ? { positive: 1, neutral: 0, negative: 0 } : { positive: 0, neutral: 0, negative: 1 },
  opinion_weight: p.label === 'positive' ? 2 : 1, non_opinion_weight: p.label === 'positive' ? 0 : 1, mixed_opinion_weight: 0,
  summary: p.body_text, strengths: [], problems: [], actions: [], media: [],
  comments: comments.filter(c => c.post_id === p.post_id).map(c => ({ comment_id: c.id, author_nickname: 'Sample customer', content: c.text, published_at: date, like_count: c.likes, parent_comment_id: null, label: c.sentiment, opinion_kind: c.sentiment ? 'opinion' : 'inquiry', confidence: null, reason: null, aspects: [c.topic], represented_count: 1, cluster_total_likes: c.likes })),
})
const entries: Record<string, unknown> = {
  'overview.json': demoOverview, 'rag-corpus.json': demoCorpus, 'review-queue.json': demoQueue,
  'posts.json': { job_id: 'processed', total: 2, items: posts.map(p => ({ ...p, platform: 'xhs', canonical_url: '', published_at: date, excerpt: p.body_text, author_nickname: 'Sample customer', retrieved_comment_count: 2, overall_label: p.label, overall_score: null, status: 'completed', has_video: false })) },
  'time-tree.json': { job_id: 'processed', years: [{ year: 2026, count: 2, months: [{ month: 6, count: 2, weeks: [{ iso_year: 2026, week: 23, label: 'Jun 1–7', start_date: '2026-06-01', end_date: '2026-06-07', count: 2, days: [{ date: '2026-06-01', count: 2 }] }] }] }] },
  'needs.json': { pending_normalization: 0, items: [{ id: 'demo-need1', kind: 'question', title: 'Quiet visiting hours', title_en: 'Quiet visiting hours', count: 1, likes: 2, score: 3, sources: [{ comment_id: 'demo-c2', post_id: 'demo-p1', platform: 'xhs', text: comments[1].text, post_title: posts[0].title, likes: 2 }] }] },
  'explorer.json': { global: charts, topics: Object.fromEntries(Object.keys(names).map(id => [id, {
    charts: Object.fromEntries(Object.keys(charts).map(period => [period, { ...chart, timeline: chart.timeline.filter(row => row.topic_id === id), scatter: chart.scatter.filter(row => row.id === id) }])),
    items: [
      ...posts.filter(p => p.topic === id).map(p => ({ id: p.post_id, post_id: p.post_id, kind: 'post', date: '2026-06-01', sentiment: null, text: p.body_text, title: p.title, likes: p.likes })),
      ...comments.filter(c => c.topic === id).map(c => ({ ...c, kind: 'comment', date: '2026-06-01', title: posts.find(p => p.post_id === c.post_id)!.title, is_question: !c.sentiment, topic_evidence: c.text })),
    ],
  }])) },
  ...Object.fromEntries(posts.map(p => [`post-details/${p.post_id}.json`, detail(p)])),
  ...Object.fromEntries(posts.map(p => [`post-packets/${p.post_id}.json`, {
    schema_version: 'web-collection-v1', processed_at: date,
    post: { id: p.post_id, platform: 'xhs', title: p.title, body: p.body_text, publishedAt: date, url: '', media: [], likes: p.likes, raw: {} },
    comments: comments.filter(c => c.post_id === p.post_id).map(c => ({
      id: c.id, text: c.text, clean_text: c.text, likes: c.likes, parentId: null, raw: {},
      analysis: { id: c.id, target: 'brand', sentiment: c.sentiment ?? 'neutral', question: !c.sentiment, topic: names[c.topic], summary: c.text },
    })),
    analysis: { post: { brand_related: true, summary: p.body_text, topics: [names[p.topic]] }, analyzed_comment_count: 2, comments_truncated: false },
    source: 'fictional-sample',
  }])),
}
export function readDemoMirror(key: string): unknown {
  return entries[key]
}
