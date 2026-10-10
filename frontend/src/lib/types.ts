export type Sentiment = 'positive' | 'neutral' | 'negative'
export type Platform = 'xhs' | 'douyin'
export type OpinionKind = 'opinion' | 'mixed_opinion' | 'inquiry' | 'factual' | 'social' | 'off_topic'

export interface Ratio {
  positive: number
  neutral: number
  negative: number
}

export interface RepresentativePost {
  post_id: string
  platform: Platform
  media_kind: 'post' | 'video'
  category: 'positive' | 'problem' | 'engagement'
  recommendation_reason: string
  canonical_url: string
  published_at: string
  retrieved_comment_count: number
  title: string
  excerpt: string
  overall_label: Sentiment
}

export interface Overview {
  demo?: boolean
  job_id: string
  status: string
  created_at: string
  completed_at: string | null
  sample_size: number
  comment_count: number
  platform_count: { xhs: number; douyin: number }
  weighted_ratio: Ratio
  raw_ratio: Ratio
  opinion_weight: number
  non_opinion_weight: number
  mixed_opinion_weight: number
  intent_count: Record<string, number>
  topics: TopicOverviewItem[]
  topic_mentions: number
  topic_candidates: string[]
  summary: string
  strengths: string[]
  problems: string[]
  actions: string[]
  representative_posts: RepresentativePost[]
}

export interface TopicOverviewItem {
  id: string
  name: string
  name_en: string
  represented_mentions: number
  opinion_mentions: number
  non_opinion_mentions: number
  mixed_opinion_mentions: number
  sentiment_count: Record<Sentiment, number>
  sentiment_ratio: Ratio
  negative_priority: number
  post_count?: number | null
  comment_count?: number | null
  discussion_score?: number | null
  like_count?: number | null
}

export interface PostListItem {
  post_id: string
  platform: Platform
  canonical_url: string
  published_at: string
  title: string
  excerpt: string
  author_nickname: string
  retrieved_comment_count: number
  overall_label: Sentiment
  overall_score: number | null
  status: string
  has_video: boolean
}

export interface PostListResponse {
  job_id: string
  total: number
  items: PostListItem[]
}

export interface TimeDay { date: string; count: number }
export interface TimeWeek { iso_year: number; week: number; label: string; start_date: string; end_date: string; count: number; days: TimeDay[] }
export interface TimeMonth { month: number; count: number; weeks: TimeWeek[] }
export interface TimeYear { year: number; count: number; months: TimeMonth[] }
export interface TimeTreeResponse { job_id: string; years: TimeYear[] }

export interface MediaEvidence {
  media_id: string
  media_type: string
  sequence_no: number
  status: string
  local_url: string | null
  extraction_type: string | null
  extraction_status: string | null
  extracted_text: string | null
  review_text_relevant?: boolean | null
  skip_reason?: string | null
}

export interface CommentEvidence {
  comment_id: string
  author_nickname: string
  content: string
  published_at: string
  like_count: number
  parent_comment_id: string | null
  label: Sentiment | null
  opinion_kind: OpinionKind
  confidence: number | null
  reason: string | null
  aspects: string[]
  represented_count: number
  cluster_total_likes: number
}

export interface PostDetail {
  post_id: string
  platform: Platform
  canonical_url: string
  published_at: string
  title: string
  body_text: string
  author: { nickname: string; profile_url: string | null }
  retrieved_comment_count: number
  analysis_status: string
  overall_label: Sentiment
  overall_score: number | null
  raw_distribution: Ratio
  weighted_distribution: Ratio
  opinion_weight: number
  non_opinion_weight: number
  mixed_opinion_weight: number
  summary: string
  strengths: string[]
  problems: string[]
  actions: string[]
  media: MediaEvidence[]
  comments: CommentEvidence[]
}

export interface CollectionJob {
  job_id: string
  status: string
  platforms: string[]
  keywords: string[]
  start_date: string
  end_date: string
  limit: number
  created_at: string
  post_count: number
  last_event: string | null
  progress: number
}

export type PipelineStageName = 'scope' | 'collection' | 'persistence' | 'comments' | 'analysis' | 'json' | 'vectors' | 'publish'

export interface PipelineStage {
  name: PipelineStageName
  status: string
  total_count: number
  completed_count: number
  failed_count: number
  error: string | null
}

export interface PipelineLiveProgress {
  scope_total: number
  scope_completed: number
  scope_in_progress: number
  scope_partial: number
  posts_saved: number
  processed_posts?: number
  indexed_posts?: number
  comments_completed: number
  comments_failed: number
  media_downloaded: number
  media_failed: number
  media_pending: number
  current_activity: string | null
  elapsed_seconds: number
}

export interface PipelineJob {
  job_id: string
  status: string
  platforms: Platform[]
  keywords: string[]
  start_date: string
  end_date: string
  created_at: string
  completed_at: string | null
  current_stage: PipelineStageName
  recovery_count: number
  stages: PipelineStage[]
  live_progress?: PipelineLiveProgress | null
}

export interface ProcessingJob {
  job_id: string
  status: string
  source_collection_job_id: string | null
  total_posts: number
  completed_posts: number
  reused_posts: number
  failed_posts: number
  created_at: string
  completed_at: string | null
  last_event: string | null
  progress: number
}

export interface ReportSelection {
  post_ids?: string[]
  start_date?: string
  end_date?: string
  label: string
}

export interface ReportPreview {
  selection: ReportSelection
  selected_posts: number
  available_posts: number
  unavailable_posts: number
  effective_post_ids: string[]
}

export interface DeletionCounts {
  selected_posts: number
  shared_posts: number
  posts_to_delete: number
  comments: number
  media: number
  analyses: number
  disk_bytes: number
}

export interface DeletionPreview {
  token: string
  confirmation_text: string
  expires_at: string
  counts: DeletionCounts
}

export interface DeletionResult {
  deleted_posts: number
  preserved_shared_posts: number
  deleted_comments: number
  deleted_media: number
  file_warnings: string[]
}

export interface RagIndexStatus {
  ready: boolean
  stale: boolean
  source_packets: number
  indexed_posts: number
  indexed_chunks: number
  built_at: string | null
  embedding_model: string
  execution_engine: 'ray' | 'serial'
  parallelism: number
}

export interface RagBenchmarkItem {
  id: string
  category: string
  question: string
  hit_count: number
  top_score: number
  source_diversity: number
  signal_recall: number
  passed: boolean
}

export interface RagBenchmarkReport {
  question_count: number
  passed_count: number
  pass_rate: number
  mean_top_score: number
  mean_signal_recall: number
  execution_engine: 'ray' | 'serial'
  elapsed_seconds: number
  grade: '优秀' | '良好' | '需改进' | '不可用'
  items: RagBenchmarkItem[]
}

export interface RagSource {
  post_id: string
  platform: Platform
  title: string
  source_url: string
  published_at: string
  score: number
  excerpt: string
  matched_chunks: number
}

export interface RagAnswer {
  answer: string
  sources: RagSource[]
  retrieved_chunks: number
}

export interface WebSyncLastRun {
  started_at: string
  finished_at: string | null
  full: boolean
  total_local: number
  synced: number
  skipped: number
  failed: number
  errors: string[]
  protocol?: string
  snapshot_id?: string | null
  published?: boolean
  reset_used?: boolean
}

export interface WebSyncStatus {
  configured: boolean
  auto_sync: boolean
  site: string
  running: boolean
  pending_count: number
  last_run: WebSyncLastRun | null
  last_check: {
    checked_at: string
    ok: boolean
    message: string
    protocol: string | null
    accepts?: string[]
    max_batch_size?: number
    capabilities?: string[]
  } | null
}

export interface CrawlerSchedule {
  enabled: boolean
  time: string
  keywords: string[]
  platforms: string[]
  last_run: string | null
  last_result: CrawlerLastResult | null
}

export interface CrawlerLastResult {
  trigger: string
  started_at: string
  finished_at: string | null
  platforms: Record<string, { posts: number; new_posts: number; comments: number; seconds?: number }>
  error: string | null
  post_processed?: number
  post_process_error?: string
}

export interface CrawlerStatus {
  installed: boolean
  logged_in: Record<string, boolean>
  schedule: CrawlerSchedule
  running: boolean
  last_result: CrawlerLastResult | null
}

export interface DatabaseStats {
  posts: number
  comments: number
  media_assets: number
  safe_packets: number
  vector_posts: number
  vector_chunks: number
  db_file_bytes: number
  media_dir_bytes: number
}
