import { Ui } from '../../i18n/Ui';
import { ExternalLink, MessageCircle, Video } from 'lucide-react'
import type { RepresentativePost } from '../../lib/types'

const categoryLabel = {
  positive: '正面代表',
  problem: '问题代表',
  engagement: '高互动',
}

interface RepresentativeContentProps {
  posts: RepresentativePost[]
  onOpenPost: (postId: string) => void
}

export function RepresentativeContent({ posts, onOpenPost }: RepresentativeContentProps) {
  return (
    <Ui as="section" className="representative-section">
      <Ui as="div" className="section-heading">
        <Ui as="div"><Ui as="h2">代表性内容</Ui><Ui as="p">按正面、问题和互动价值选出，所有链接来自实际采集。</Ui></Ui>
      </Ui>
      <Ui as="div" className="representative-list">
        {posts.map((post) => (
          <Ui as="article" className="representative-row" key={post.post_id}>
            <Ui as="div" className={`platform-mark ${post.platform}`} aria-hidden="true">
              {post.media_kind === 'video' ? <Video size={19} /> : post.platform === 'xhs' ? '红' : '抖'}
            </Ui>
            <Ui as="div" className="representative-main">
              <Ui as="div" className="row-meta">
                <Ui as="span" className={`category-text ${post.category}`}>{categoryLabel[post.category]}</Ui>
                <Ui as="span">{post.platform === 'xhs' ? '小红书' : '抖音'}</Ui>
                <Ui as="span"><MessageCircle size={14} />{post.retrieved_comment_count}</Ui>
              </Ui>
              <Ui as="h3">{post.title}</Ui>
              <Ui as="p">{post.excerpt || post.recommendation_reason}</Ui>
            </Ui>
            <Ui as="div" className="row-actions">
              <Ui as="button" className="text-button" type="button" onClick={() => onOpenPost(post.post_id)}>查看详情</Ui>
              <Ui as="a" className="external-link" href={post.canonical_url} target="_blank" rel="noreferrer">原帖<ExternalLink size={15} /></Ui>
            </Ui>
          </Ui>
        ))}
      </Ui>
    </Ui>
  )
}
