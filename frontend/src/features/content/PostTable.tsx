import { Ui } from '../../i18n/Ui';
import { ChevronRight, ExternalLink, MessageCircle, Video } from 'lucide-react'
import type { PostListItem } from '../../lib/types'

const sentimentLabel = { positive: '正面', neutral: '中性', negative: '负面' }

export function PostTable({ posts, onOpen, selectedIds, onSelectionChange }: {
  posts: PostListItem[]
  onOpen: (postId: string) => void
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
}) {
  const selected = new Set(selectedIds)
  const allSelected = posts.length > 0 && posts.every((post) => selected.has(post.post_id))
  const toggle = (postId: string) => onSelectionChange(selected.has(postId) ? selectedIds.filter((id) => id !== postId) : [...selectedIds, postId])
  return (
    <Ui as="div" className="post-table-wrap">
      <Ui as="table" className="post-table">
        <Ui as="thead"><Ui as="tr"><Ui as="th" className="select-cell"><Ui as="input" aria-label="选择当前全部帖子" type="checkbox" checked={allSelected} onChange={() => onSelectionChange(allSelected ? selectedIds.filter((id) => !posts.some((post) => post.post_id === id)) : Array.from(new Set([...selectedIds, ...posts.map((post) => post.post_id)])))} /></Ui><Ui as="th">内容</Ui><Ui as="th">平台</Ui><Ui as="th">情感</Ui><Ui as="th">评论</Ui><Ui as="th">发布时间</Ui><Ui as="th"><Ui as="span" className="sr-only">操作</Ui></Ui></Ui></Ui>
        <Ui as="tbody">{posts.map((post) => (
          <Ui as="tr" key={post.post_id}>
            <Ui as="td" className="select-cell"><Ui as="input" aria-label={`选择帖子 ${post.title}`} type="checkbox" checked={selected.has(post.post_id)} onChange={() => toggle(post.post_id)} /></Ui>
            <Ui as="td"><Ui as="button" className="post-title-button" type="button" aria-label={`打开帖子 ${post.title}`} onClick={() => onOpen(post.post_id)}><Ui as="span">{post.has_video ? <Video size={16} /> : null}<Ui as="span" data-original>{post.title}</Ui></Ui><Ui as="small" data-original>{post.author_nickname}</Ui></Ui></Ui>
            <Ui as="td">{post.platform === 'xhs' ? '小红书' : '抖音'}</Ui>
            <Ui as="td"><Ui as="span" className={`sentiment-text ${post.overall_label}`}>{sentimentLabel[post.overall_label]}</Ui></Ui>
            <Ui as="td"><Ui as="span" className="metric-inline"><MessageCircle size={14} />{post.retrieved_comment_count}</Ui></Ui>
            <Ui as="td">{new Date(post.published_at).toLocaleDateString('zh-CN')}</Ui>
            <Ui as="td"><Ui as="div" className="table-actions"><Ui as="a" href={post.canonical_url} target="_blank" rel="noreferrer" aria-label="在新窗口查看原帖"><ExternalLink size={16} /></Ui><Ui as="button" type="button" onClick={() => onOpen(post.post_id)} aria-label="查看详情"><ChevronRight size={18} /></Ui></Ui></Ui>
          </Ui>
        ))}</Ui>
      </Ui>
    </Ui>
  )
}
