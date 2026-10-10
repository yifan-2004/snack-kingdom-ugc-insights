import { ApiError } from './api'

interface ExportPayload {
  title?: string
  markdown?: string
  use_latest?: boolean
}

async function requestReportDoc(payload: ExportPayload): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch('/api/reports/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new ApiError(data.detail || '导出失败，请稍后再试', response.status)
  }
  const disposition = response.headers.get('Content-Disposition') || ''
  const starMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  const plainMatch = disposition.match(/filename="?([^";]+)"?/i)
  const filename = starMatch
    ? decodeURIComponent(starMatch[1])
    : plainMatch
      ? plainMatch[1]
      : '零食王国舆情报告.doc'
  return { blob: await response.blob(), filename }
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** 把报告全文导出为 Word 兼容 .doc（后端同时落盘 data/reports/），并触发浏览器下载。 */
export async function saveReportAsDocument(markdown: string, title: string): Promise<string> {
  const { blob, filename } = await requestReportDoc({ title, markdown })
  triggerDownload(blob, filename)
  return filename
}

/** 导出服务端最近生成完成的分析报告（AI 分析后台任务落盘的 leader-summary）。 */
export async function saveLatestReportAsDocument(): Promise<string> {
  const { blob, filename } = await requestReportDoc({ title: '零食王国舆情报告', use_latest: true })
  triggerDownload(blob, filename)
  return filename
}
