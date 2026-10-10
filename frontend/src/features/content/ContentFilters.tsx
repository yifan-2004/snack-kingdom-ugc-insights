import { Ui } from '../../i18n/Ui';
import { Search } from 'lucide-react'
import type { PostFilters } from '../../hooks/usePosts'

export function ContentFilters({ value, onChange }: { value: PostFilters; onChange: (value: PostFilters) => void }) {
  return (
    <Ui as="div" className="content-filters">
      <Ui as="label" className="search-field"><Search size={17} /><Ui as="span" className="sr-only">关键词</Ui><Ui as="input" value={value.query} placeholder="搜索帖子正文" onChange={(event) => onChange({ ...value, query: event.target.value })} /></Ui>
      <Ui as="label"><Ui as="span">平台</Ui><Ui as="select" value={value.platform} onChange={(event) => onChange({ ...value, platform: event.target.value as PostFilters['platform'] })}><Ui as="option" value="">全部平台</Ui><Ui as="option" value="xhs">小红书</Ui><Ui as="option" value="douyin">抖音</Ui></Ui></Ui>
      <Ui as="label"><Ui as="span">情感</Ui><Ui as="select" value={value.sentiment} onChange={(event) => onChange({ ...value, sentiment: event.target.value as PostFilters['sentiment'] })}><Ui as="option" value="">全部情感</Ui><Ui as="option" value="positive">正面</Ui><Ui as="option" value="neutral">中性</Ui><Ui as="option" value="negative">负面</Ui></Ui></Ui>
    </Ui>
  )
}
