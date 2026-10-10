import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPut } from '../../lib/api'
import './campaign-quadrant.css'

type Row = { post_id: string; title: string; author: string; platform: string; creator_type: string; reads: number | null; cost: number | null; interactions: number | null; automatic_interactions: number | null; interaction_override: number | null; updated_at: string | null }
type Point = { id: string; name: string; cpv: number; engagement_rate: number; cpe: number | null; quadrant: string; post_ids: string[]; reads: number; cost: number; interactions: number }
type Summary = { points: Point[]; x_mean: number | null; y_mean: number | null; eligible_count: number; missing_count: number }
type Data = { records: Row[]; by_type: Summary; by_post: Summary }
const colors: Record<string, string> = { A: '#278361', B: '#497ab1', C: '#bc7c28', D: '#c75d49' }
const labels: Record<string, string> = { A: '优先投入', B: '优化互动', C: '关注成本', D: '谨慎投入' }
const num = (v: number) => v.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
const pct = (v: number) => `${num(v * 100)}%`

export function CampaignQuadrant({ onOpenPost }: { onOpenPost: (id: string) => void }) {
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState('')
  const [group, setGroup] = useState<'type' | 'post'>('type'), [editing, setEditing] = useState(false), [selected, setSelected] = useState('')
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try { const result = await apiGet<Data>('/api/overview/campaign', signal); if (!signal?.aborted) { setData(result); setError('') } }
    catch { if (!signal?.aborted) setError('投放数据暂时无法读取，请重试。') }
  }, [])
  useEffect(() => {
    const c = new AbortController(); void refresh(c.signal)
    const update = () => { if (document.visibilityState !== 'hidden') void refresh(c.signal) }
    const timer = window.setInterval(update, 60000)
    window.addEventListener('workbench-data-changed', update); window.addEventListener('focus', update)
    return () => { c.abort(); clearInterval(timer); window.removeEventListener('workbench-data-changed', update); window.removeEventListener('focus', update) }
  }, [refresh])
  const summary = data ? (group === 'type' ? data.by_type : data.by_post) : null
  const point = summary?.points.find(p => p.id === selected)
  return <section className="campaign-panel" aria-labelledby="campaign-heading">
    <div className="campaign-heading"><div><span className="campaign-eyebrow">投放效果</span><h2 id="campaign-heading">阅读效率 × 互动率</h2><p>CPV = 阅读数 ÷ 投入成本，越靠右效率越高；越靠上互动越活跃。</p></div><button type="button" className="campaign-button" onClick={() => setEditing(!editing)} aria-expanded={editing}>{editing ? '收起数据编辑' : '补充投放数据'}</button></div>
    <div className="campaign-toolbar"><div className="campaign-tabs" aria-label="投放图分组"><button type="button" aria-pressed={group === 'type'} onClick={() => { setGroup('type'); setSelected('') }}>按达人类型</button><button type="button" aria-pressed={group === 'post'} onClick={() => { setGroup('post'); setSelected('') }}>按帖子</button></div>{summary && <span>{summary.eligible_count} 篇参与 · {summary.missing_count} 篇数据未齐</span>}</div>
    {error && <p role="alert">{error} <button type="button" onClick={() => void refresh()}>重新读取</button></p>}
    {!data && !error && <p role="status">正在读取投放数据…</p>}
    {summary && <><Scatter summary={summary} selected={selected} onSelect={setSelected}/>
      {!summary.points.length && <div className="campaign-empty"><strong>补充阅读数和投入成本，即可查看投放分布</strong><p>不把播放量当阅读数，也不把缺失成本当作零。互动数可自动使用采集结果。</p><button type="button" className="campaign-button" onClick={() => setEditing(true)}>填写真实投放数据</button></div>}
      {summary.points.length > 0 && <div className="campaign-point-list" aria-label="选择投放数据点">{summary.points.map(p => <button type="button" key={p.id} aria-pressed={p.id === selected} onClick={() => setSelected(p.id)}><i style={{ background: colors[p.quadrant] }}/>{p.name}<small>CPV {num(p.cpv)} · {pct(p.engagement_rate)}</small></button>)}</div>}
      {point && <div className="campaign-detail"><strong style={{ color: colors[point.quadrant] }}>{point.name} · {labels[point.quadrant]}</strong><p>阅读 {num(point.reads)} · 投入 ¥{num(point.cost)} · 互动 {num(point.interactions)} · CPE {point.cpe === null ? '暂无（无互动）' : `¥${num(point.cpe)}/次`}</p><div>{point.post_ids.map(id => <button type="button" key={id} onClick={() => onOpenPost(id)}>{data?.records.find(r => r.post_id === id)?.title || '查看帖子'} →</button>)}</div></div>}
      <details className="campaign-method"><summary>数据口径与四象限怎么看</summary><p>范围为本地已采集帖子，只有阅读数大于 0、投入成本大于 0 且互动数完整的帖子进入图表。互动率 =（点赞 + 评论 + 收藏 + 分享）÷ 阅读数，是互动次数比例，不是独立用户比例。阅读数、互动数与成本应对应同一统计时段，成本按帖子分摊。</p><p>按达人类型展示时，先合计阅读数、成本和互动数再计算比率。虚线是当前图中各点的算术平均值，等于均值归入较高一侧。只有一个点时不构成有效比较。四象限是相对表现，不代表销售回报；CPE = 成本 ÷ 互动次数。</p><p>采集互动数随刷新更新；手填互动数优先使用，清空后恢复自动值。阅读数和投入成本需自行维护，保存不会重新调用模型或改变帖子分析结果。</p></details>
    </>}
    {editing && data && <MetricEditor records={data.records} onSaved={async () => { await refresh(); window.dispatchEvent(new Event('workbench-data-changed')) }}/ >}
  </section>
}

function Scatter({ summary, selected, onSelect }: { summary: Summary; selected: string; onSelect: (id: string) => void }) {
  const { points, x_mean, y_mean } = summary
  const maxX = Math.max(...points.map(p => p.cpv), 1) * 1.2, maxY = Math.max(...points.map(p => p.engagement_rate), .01) * 1.25
  const x = (n: number) => 80 + n / maxX * 850, y = (n: number) => 375 - n / maxY * 295
  const mx = x(x_mean ?? maxX / 2), my = y(y_mean ?? maxY / 2)
  return <div className="campaign-chart"><svg viewBox="0 0 1000 445" role="img" aria-label="投放效果四象限图：横轴阅读数除以成本，纵轴互动率；右上角优先投入">
    <rect x="80" y="80" width={mx - 80} height={my - 80} fill="#fcf0dc"/><rect x={mx} y="80" width={930 - mx} height={my - 80} fill="#e9f4ed"/>
    <rect x="80" y={my} width={mx - 80} height={375 - my} fill="#faeae5"/><rect x={mx} y={my} width={930 - mx} height={375 - my} fill="#eaf1f8"/>
    <text x="80" y="22" className="campaign-axis">互动率 ↑</text><text x="90" y="64" fill={colors.C}>C · 高互动 / 低效率</text><text x="920" y="64" textAnchor="end" fill={colors.A}>A · 高互动 / 高效率</text>
    <text x="90" y="432" fill={colors.D}>D · 低互动 / 低效率</text><text x="920" y="432" textAnchor="end" fill={colors.B}>B · 低互动 / 高效率</text>
    {[0, 1, 2, 3, 4].map(i => <g key={i}><text x="68" y={y(maxY * i / 4) + 4} textAnchor="end">{points.length ? pct(maxY * i / 4) : i === 0 ? '0' : ''}</text><text x={x(maxX * i / 4)} y="398" textAnchor="middle">{points.length ? num(maxX * i / 4) : i === 0 ? '0' : ''}</text></g>)}
    <path d="M80 80 V375 H930" fill="none" stroke="#b5b3a8"/><path d={`M${mx} 80 V375 M80 ${my} H930`} stroke="#8d958d" strokeDasharray="5 5" fill="none"/>
    {points.length > 0 && <><text x={mx} y="42" textAnchor="middle">CPV 均值 {num(x_mean!)}</text><text x="920" y={Math.max(99, my - 8)} textAnchor="end">互动率均值 {pct(y_mean!)}</text></>}
    {points.map(p => <g key={p.id} role="button" tabIndex={0} aria-label={`${p.name}，CPV ${num(p.cpv)}，互动率 ${pct(p.engagement_rate)}`} onClick={() => onSelect(p.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p.id) } }} className="campaign-dot"><title>{p.name} · CPV {num(p.cpv)} · 互动率 {pct(p.engagement_rate)}</title><rect x={x(p.cpv) - 14} y={y(p.engagement_rate) - 26} width={points.length <= 10 || selected === p.id ? 132 : 28} height="40" fill="transparent"/><circle cx={x(p.cpv)} cy={y(p.engagement_rate)} r={selected === p.id ? 8 : 6} fill={colors[p.quadrant]} stroke="white" strokeWidth="2"/>{(points.length <= 10 || selected === p.id) && <text x={x(p.cpv) + 11} y={y(p.engagement_rate) - 10}>{p.name.slice(0, 8)}{p.name.length > 8 ? '…' : ''}</text>}</g>)}
    <text x="510" y="418" textAnchor="middle" className="campaign-axis">CPV（阅读 / 元）→</text>
  </svg></div>
}

function MetricEditor({ records, onSaved }: { records: Row[]; onSaved: () => Promise<void> }) {
  const [query, setQuery] = useState(''), [id, setId] = useState(''), [category, setCategory] = useState(''), [reads, setReads] = useState(''), [cost, setCost] = useState(''), [interactions, setInteractions] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const row = records.find(r => r.post_id === id)
  const choose = (key: string) => { const r = records.find(item => item.post_id === key); setId(key); setCategory(r?.creator_type || ''); setReads(r?.reads?.toString() ?? ''); setCost(r?.cost?.toString() ?? ''); setInteractions(r?.interaction_override?.toString() ?? ''); setMessage('') }
  const filtered = records.filter(r => `${r.title} ${r.author}`.toLowerCase().includes(query.toLowerCase()))
  return <form className="campaign-editor" onSubmit={async e => { e.preventDefault(); if (!row || busy) return; setBusy(true); setMessage(''); try { await apiPut(`/api/overview/campaign/${encodeURIComponent(id)}`, { creator_type: category.trim(), reads: reads === '' ? null : Number(reads), cost: cost === '' ? null : Number(cost), interactions: interactions === '' ? null : Number(interactions) }); await onSaved(); setMessage('已保存，四象限已更新。') } catch { setMessage('保存失败，请检查输入和本地服务后重试。') } finally { setBusy(false) } }}>
    <h3>补充投放数据</h3><p>仅填写实际投放的帖子。留空表示暂无数据，零成本帖子不进入效率比较。</p>
    <fieldset disabled={busy}><label>搜索帖子或作者<input value={query} onChange={e => setQuery(e.target.value)} placeholder="输入标题或作者"/></label><label>选择帖子<select value={id} onChange={e => choose(e.target.value)} required><option value="">请选择一篇帖子</option>{row && !filtered.some(r => r.post_id === id) && <option value={id}>{row.title}</option>}{filtered.map(r => <option key={r.post_id} value={r.post_id}>{r.platform === 'xhs' ? '小红书' : '抖音'} · {r.author} · {r.title}</option>)}</select></label>
    {row && <><div className="campaign-fields"><label>达人类型<input maxLength={60} value={category} onChange={e => setCategory(e.target.value)} placeholder="如：美食探店、亲子"/></label><label>阅读数<input type="number" min="0" max="1000000000000" step="1" value={reads} onChange={e => setReads(e.target.value)} placeholder="填写真实阅读数"/></label><label>投入成本（元，本帖分摊）<input type="number" min="0" max="1000000000000" step="0.01" value={cost} onChange={e => setCost(e.target.value)} placeholder="填写真实成本"/></label><label>互动总数（可选手填）<input type="number" min="0" max="1000000000000" step="1" value={interactions} onChange={e => setInteractions(e.target.value)} placeholder={row.automatic_interactions === null ? '采集数据不完整，请补充' : `自动值 ${num(row.automatic_interactions)}`}/></label></div><p>互动总数 = 点赞 + 评论 + 收藏 + 分享。手填值覆盖自动值，清空则恢复自动值。{row.updated_at && ` 上次填写：${new Date(row.updated_at).toLocaleString('zh-CN')}`}</p><button type="submit" className="campaign-button">{busy ? '正在保存…' : '保存并更新图表'}</button></>}
    </fieldset><p role="status">{message}</p>
  </form>
}
