import { Ui } from '../../i18n/Ui';
import { useState } from 'react'
import type { Overview } from '../../lib/types'
import { useLanguage } from '../../i18n/LanguageContext'
import { NeedsBoard } from './NeedsBoard'

export function TopicFirstOverview({ data, onEnter, onTopic, onOpenPost }: { data: Overview; onEnter: () => void; onTopic: (id: string) => void; onOpenPost: (id: string) => void }) {
  const { language } = useLanguage()
  const english = language === 'en'
  const [ranking, updateRanking] = useState<'discussion' | 'likes' | 'feedback'>(() => {
    const saved = new URLSearchParams(location.search).get('ranking')
    return saved === 'likes' || saved === 'feedback' ? saved : 'discussion'
  })
  const setRanking = (value: 'discussion' | 'likes' | 'feedback') => {
    updateRanking(value)
    const url = new URL(location.href)
    url.searchParams.set('ranking', value)
    history.replaceState(null, '', url)
  }
  const [postWeight, setPostWeight] = useState(1)
  const [commentWeight, setCommentWeight] = useState(1)
  const legacy = data.topics.some(t => t.post_count == null)
  const ranked = data.topics.filter(t => ranking !== 'likes' || t.like_count != null)
  const score = (topic: Overview['topics'][number]) => ranking === 'likes' ? topic.like_count || 0
    : topic.post_count != null ? topic.post_count * postWeight + (topic.comment_count || 0) * commentWeight : topic.represented_mentions
  const visible = [...ranked].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id)).slice(0, 7)
  const attention = [...data.topics]
    .sort((left, right) => right.negative_priority - left.negative_priority)
    .slice(0, 4)
  const number = (value: number) => value.toLocaleString(english ? 'en-US' : 'zh-CN')

  return <Ui as="div" className="topic-first-overview">
    <Ui as="section" className="topic-first-hero">
      <Ui as="div">
        <Ui as="p" className="topic-kicker">{english ? 'Brand feedback' : '品牌反馈'}</Ui>
        <Ui as="h1">{english ? 'See what people discuss before judging how they feel' : '先看用户在谈什么，再看每个话题的态度'}</Ui>
        <Ui as="p" className="topic-hero-copy">{english
          ? 'Explore discussion volume, likes, and sentiment by topic, then check the source evidence.'
          : '按主题查看讨论量、点赞和评价倾向，再回到帖子与评论核查原因。'}</Ui>
      </Ui>
      <Ui as="button" type="button" className="topic-primary-action" onClick={onEnter}>{english ? 'Open content analysis' : '进入内容分析'}</Ui>
    </Ui>

    <Ui as="section" className="topic-kpi-grid" aria-label={english ? 'Topic summary' : '主题数据摘要'}>
      <TopicKpi label={english ? 'Topics with evidence' : '有反馈的主题'} value={number(data.topics.length)} note={english ? 'Published Topics with current evidence' : '只统计有当前证据的正式话题'} />
      <TopicKpi label={english ? 'Topic mention weight' : '话题提及权重'} value={number(data.topic_mentions)} note={english ? 'One comment may discuss multiple Topics' : '同一条反馈可讨论多个话题'} />
      <TopicKpi label={english ? 'Suggested topics' : '候选主题'} value={number(data.topic_candidates.length)} note={english ? 'Candidates stay outside official metrics' : '确认后才进入正式分析口径'} />
      <TopicKpi label={english ? 'Posts in scope' : '当前帖子范围'} value={number(data.sample_size)} note={english ? 'Findings apply only to this sample' : '所有结论仅适用于当前载入范围'} />
    </Ui>

    <Ui as="section" className="topic-command-grid">
      <Ui as="article" className="topic-command-panel topic-ranking-panel">
        <div data-native-i18n className="topic-ranking-controls">
          <button type="button" aria-pressed={ranking === 'discussion'} onClick={() => setRanking('discussion')}>{english ? 'Discussion volume' : '讨论量榜'}</button>
          <button type="button" aria-pressed={ranking === 'likes'} onClick={() => setRanking('likes')}>{english ? 'Total likes' : '点赞总量榜'}</button>
          <button type="button" aria-pressed={ranking === 'feedback'} onClick={() => setRanking('feedback')}>{english ? 'Customer feedback' : '用户反馈榜'}</button>
          {ranking === 'discussion' && <div>
            <label>{english ? 'Post weight' : '帖子权重'} <input type="number" disabled={legacy} min={0} max={100} step={0.1} value={postWeight} onChange={e => setPostWeight(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} /></label>
            <label>{english ? 'Comment weight' : '评论权重'} <input type="number" disabled={legacy} min={0} max={100} step={0.1} value={commentWeight} onChange={e => setCommentWeight(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} /></label>
          </div>}
          {ranking !== 'feedback' && <small>{english ? 'Each source counts once per topic. Weights affect this view only.' : '同一来源在每个主题中只计一次。权重仅调整当前榜单。'}</small>}
          {legacy && ranking !== 'feedback' ? <p role="status">{english ? 'These records need contextual reanalysis. Discussion scores still reflect the previous method; source weights and likes become available after reprocessing in Collect & Process.' : '这些记录尚需重新分析：讨论量暂沿用原有口径，源数据权重和点赞榜将在“采集与处理”更新后可用。'}</p> : null}
        </div>
        {ranking === 'feedback' ? <NeedsBoard onOpenPost={onOpenPost} initialKind="feedback" embedded /> : <>
        <Ui as="header"><Ui as="div"><Ui as="p" className="topic-section-label">{english ? 'Discussion' : '讨论分布'}</Ui><Ui as="h2">{english ? 'Main discussion Topics' : '主要讨论主题'}</Ui></Ui><Ui as="div" className="topic-legend"><Ui as="span" className="positive">{english ? 'Support' : '支持'}</Ui><Ui as="span" className="neutral">{english ? 'Truly neutral' : '真正中性'}</Ui><Ui as="span" className="negative">{english ? 'Critical' : '质疑 / 不满'}</Ui></Ui></Ui>
        {visible.length ? <Ui as="div" className="topic-ranking-list">{visible.map((topic, index) => {
          const positive = topic.sentiment_ratio.positive * 100
          const neutral = topic.sentiment_ratio.neutral * 100
          const negative = topic.sentiment_ratio.negative * 100
          return <Ui as="div" className="topic-ranking-row" key={topic.id}>
            <Ui as="span" className="topic-rank" title={String(score(topic))}>{String(index + 1).padStart(2, '0')}<small>{score(topic).toLocaleString()}</small></Ui>
            <Ui as="div" className="topic-ranking-main"><Ui as="div" className="topic-ranking-title"><button onClick={() => onTopic(topic.id)}>{english ? topic.name_en : topic.name} →</button><Ui as="span">{number(topic.represented_mentions)} {english ? 'mentions' : '次提及'}{topic.non_opinion_mentions ? ` · ${number(topic.non_opinion_mentions)} ${english ? 'non-opinion' : '条非意见另计'}` : ''}</Ui></Ui><Ui as="div" className="topic-sentiment-track" aria-label={`${english ? topic.name_en : topic.name}: ${positive.toFixed(1)}% / ${neutral.toFixed(1)}% / ${negative.toFixed(1)}%`}><Ui as="i" className="positive" style={{ width: `${positive}%` }} /><Ui as="i" className="neutral" style={{ width: `${neutral}%` }} /><Ui as="i" className="negative" style={{ width: `${negative}%` }} /></Ui></Ui>
            <Ui as="strong" className={negative > positive ? 'risk' : 'steady'}>{negative > positive ? `${english ? 'Negative' : '负向'} ${negative.toFixed(0)}%` : `${english ? 'Positive' : '正向'} ${positive.toFixed(0)}%`}</Ui>
          </Ui>
        })}</Ui> : <Ui as="div" className="topic-empty">{english ? 'No Topic evidence is available yet.' : '暂无可用于此榜单的主题数据。'}</Ui>}
        </>}
      </Ui>

      <Ui as="article" className="topic-command-panel topic-attention-panel">
        <Ui as="header"><Ui as="div"><Ui as="p" className="topic-section-label">{english ? 'Attention' : '重点关注'}</Ui><Ui as="h2">{english ? 'Review first' : '优先核查'}</Ui></Ui><Ui as="span" className="topic-method">{english ? 'negative share × volume' : '负向占比 × 讨论规模'}</Ui></Ui>
        <Ui as="div" className="topic-attention-list">{attention.map((topic, index) => <Ui as="div" className="topic-attention-item" key={topic.id}><Ui as="span">{index + 1}</Ui><Ui as="div"><button onClick={() => onTopic(topic.id)}>{english ? topic.name_en : topic.name} →</button><Ui as="small">{number(topic.sentiment_count.negative)} {english ? 'negative /' : '次负向反馈 /'} {number(topic.opinion_mentions)} {english ? 'opinions' : '条话题态度'}</Ui></Ui><Ui as="b">{(topic.sentiment_ratio.negative * 100).toFixed(0)}%</Ui></Ui>)}</Ui>
        <Ui as="p" className="topic-attention-note">{english ? 'Priority is an investigation signal, not a business conclusion. Open the source evidence before acting.' : '优先级是排查线索，不等同于商业结论；进入详情后仍需查看原文与来源。'}</Ui>
      </Ui>
    </Ui>
  </Ui>
}

function TopicKpi({ label, value, note }: { label: string; value: string; note: string }) {
  return <Ui as="article"><Ui as="span">{label}</Ui><Ui as="strong">{value}</Ui><Ui as="small">{note}</Ui></Ui>
}
