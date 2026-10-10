import { Ui } from '../../i18n/Ui';
import { CheckCircle2, KeyRound, LoaderCircle, PlugZap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { apiGet, apiPut } from '../../lib/api'

interface ModelCenterStatus { qwen_configured: boolean; tikhub_configured: boolean }

function ProviderCard({ provider, title, description, configured, onSaved }: { provider: 'qwen' | 'tikhub'; title: string; description: string; configured: boolean; onSaved: (status: ModelCenterStatus) => void }) {
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  async function save() {
    setSaving(true); setMessage(null)
    try { const status = await apiPut<ModelCenterStatus>('/api/model-center', { [`${provider}_api_key`]: apiKey }); setApiKey(''); onSaved(status); setMessage('已保存到本机配置。') }
    catch (error) { setMessage((error as Error).message) } finally { setSaving(false) }
  }
  return <Ui as="section" className="model-center-provider">
    <Ui as="div" className="model-provider-heading"><Ui as="div"><Ui as="h2">{title}</Ui><Ui as="p">{description}</Ui></Ui><Ui as="span" className={configured ? 'provider-status configured' : 'provider-status'}>{configured ? <><CheckCircle2 size={15} />已配置</> : '未配置'}</Ui></Ui>
    <Ui as="label"><Ui as="span">{title} API Key</Ui><Ui as="input" aria-label={`${title} API Key`} type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="仅保存在当前设备" /></Ui>
    {message ? <Ui as="p" className="form-message" role="status">{message}</Ui> : null}
    <Ui as="button" className="primary-button" type="button" disabled={saving || apiKey.trim().length < 8} onClick={() => void save()}>{saving ? <><LoaderCircle size={15} />正在保存…</> : <><KeyRound size={15} />保存 {title} 配置</>}</Ui>
  </Ui>
}

export function ModelCenterPage() {
  const [status, setStatus] = useState<ModelCenterStatus>({ qwen_configured: false, tikhub_configured: false })
  const [loading, setLoading] = useState(true)
  useEffect(() => { void apiGet<ModelCenterStatus>('/api/model-center').then(setStatus).finally(() => setLoading(false)) }, [])
  return <Ui as="div" className="page model-center-page">
    <Ui as="header" className="page-header"><Ui as="div"><Ui as="h1">模型中心</Ui><Ui as="p">系统的图片、视频、分析、向量、问答和报告全部使用 Qwen；帖子采集使用 TikHub。</Ui></Ui><PlugZap size={24} aria-hidden="true" /></Ui>
    {loading ? <Ui as="div" className="inline-state">正在读取本机配置…</Ui> : <Ui as="div" className="model-center-grid">
      <ProviderCard provider="qwen" title="Qwen" description="用于图文与视频理解、JSON 生成、向量化、报告和问答。" configured={status.qwen_configured} onSaved={setStatus} />
      <ProviderCard provider="tikhub" title="TikHub" description="用于小红书和抖音的帖子、评论与媒体采集。" configured={status.tikhub_configured} onSaved={setStatus} />
    </Ui>}
  </Ui>
}
