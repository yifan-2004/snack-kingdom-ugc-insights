import { sql } from "drizzle-orm";
import {
  index,
  check,
  foreignKey,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const posts = sqliteTable(
  "posts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    externalId: text("external_id").notNull(),
    platform: text("platform").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    bodyText: text("body_text").notNull().default(""),
    labelDocument: text("label_document").notNull().default(""),
    sourceUrl: text("source_url"),
    sentiment: text("sentiment").notNull().default("neutral"),
    mediaJson: text("media_json").notNull().default("[]"),
    metadataJson: text("metadata_json").notNull().default("{}"),
    contentHash: text("content_hash").notNull().default(""),
    contentVersion: integer("content_version").notNull().default(1),
    processingStatus: text("processing_status").notNull().default("ready"),
    firstSeenAt: text("first_seen_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    lastSeenAt: text("last_seen_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    publishedAt: text("published_at"),
    syncedAt: text("synced_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_posts_platform_external_id").on(
      table.platform,
      table.externalId,
    ),
    index("idx_posts_published_at").on(table.publishedAt),
    index("idx_posts_platform").on(table.platform),
  ],
);

export const comments = sqliteTable(
  "comments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    postId: integer("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    parentExternalId: text("parent_external_id"),
    rawContent: text("raw_content").notNull().default(""),
    content: text("content").notNull(),
    cleanContent: text("clean_content").notNull().default(""),
    contentHash: text("content_hash").notNull().default(""),
    qualityScore: integer("quality_score").notNull().default(1000),
    cleaningJson: text("cleaning_json").notNull().default("{}"),
    sentiment: text("sentiment").notNull().default("neutral"),
    likeCount: integer("like_count").notNull().default(0),
    representedCount: integer("represented_count").notNull().default(1),
    isCurrent: integer("is_current", { mode: "boolean" })
      .notNull()
      .default(true),
    syncedAt: text("synced_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_comments_post_id").on(table.postId),
    index("idx_comments_post_current").on(table.postId, table.isCurrent),
    uniqueIndex("idx_comments_post_external_id").on(
      table.postId,
      table.externalId,
    ),
  ],
);

export const topics = sqliteTable(
  "topics",
  {
    id: text("id").primaryKey(),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    origin: text("origin").notNull().default("preset"),
    status: text("status").notNull().default("active"),
    aliasesJson: text("aliases_json").notNull().default("[]"),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_topics_parent_status").on(table.parentId, table.status),
    index("idx_topics_origin_status").on(table.origin, table.status),
  ],
);

export const aspects = sqliteTable(
  "aspects",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    commentId: integer("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    topicId: text("topic_id").references(() => topics.id, {
      onDelete: "set null",
    }),
    evidenceText: text("evidence_text").notNull(),
    normalizedText: text("normalized_text").notNull().default(""),
    sentiment: text("sentiment").notNull().default("neutral"),
    sentimentScore: integer("sentiment_score").notNull().default(0),
    confidence: integer("confidence").notNull().default(0),
    matchScore: integer("match_score").notNull().default(0),
    assignmentStatus: text("assignment_status").notNull().default("matched"),
    processingVersion: text("processing_version").notNull().default("pipeline-v1"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_aspects_comment_id").on(table.commentId),
    index("idx_aspects_topic_sentiment").on(table.topicId, table.sentiment),
  ],
);

export const topicCandidates = sqliteTable(
  "topic_candidates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    normalizedLabel: text("normalized_label").notNull(),
    sampleJson: text("sample_json").notNull().default("[]"),
    mentionCount: integer("mention_count").notNull().default(1),
    distinctPostCount: integer("distinct_post_count").notNull().default(1),
    status: text("status").notNull().default("collecting"),
    aiDecisionJson: text("ai_decision_json").notNull().default("{}"),
    firstSeenAt: text("first_seen_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    lastSeenAt: text("last_seen_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_topic_candidates_label").on(table.normalizedLabel),
    index("idx_topic_candidates_status_count").on(
      table.status,
      table.mentionCount,
    ),
  ],
);

export const contentVersions = sqliteTable(
  "content_versions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entityType: text("entity_type").notNull(),
    entityKey: text("entity_key").notNull(),
    version: integer("version").notNull().default(1),
    contentHash: text("content_hash").notNull(),
    rawText: text("raw_text").notNull().default(""),
    normalizedText: text("normalized_text").notNull().default(""),
    observedAt: text("observed_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_content_versions_entity_hash").on(
      table.entityType,
      table.entityKey,
      table.contentHash,
    ),
    index("idx_content_versions_entity_version").on(
      table.entityType,
      table.entityKey,
      table.version,
    ),
  ],
);

export const snapshots = sqliteTable(
  "snapshots",
  {
    id: text("id").primaryKey(),
    status: text("status").notNull().default("candidate"),
    dataCutoffAt: text("data_cutoff_at").notNull(),
    pipelineVersion: text("pipeline_version").notNull().default("pipeline-v2"),
    cleaningVersion: text("cleaning_version").notNull().default("clean-v2"),
    topicVersion: text("topic_version").notNull().default("topic-v1"),
    indexVersion: text("index_version").notNull().default("langchain-v1"),
    postCount: integer("post_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    publishedAt: text("published_at"),
  },
  (table) => [index("idx_snapshots_status_created").on(table.status, table.createdAt)],
);

export const processingRuns = sqliteTable(
  "processing_runs",
  {
    id: text("id").primaryKey(),
    snapshotId: text("snapshot_id").references(() => snapshots.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("processing"),
    receivedCount: integer("received_count").notNull().default(0),
    processedCount: integer("processed_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    errorJson: text("error_json").notNull().default("{}"),
    startedAt: text("started_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("idx_processing_runs_snapshot_status").on(
      table.snapshotId,
      table.status,
    ),
  ],
);

export const engagementObservations = sqliteTable(
  "engagement_observations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entityType: text("entity_type").notNull(),
    entityKey: text("entity_key").notNull(),
    likeCount: integer("like_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    shareCount: integer("share_count").notNull().default(0),
    observedAt: text("observed_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_engagement_entity_observed").on(
      table.entityType,
      table.entityKey,
      table.observedAt,
    ),
  ],
);

export const syncLogs = sqliteTable("sync_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postCount: integer("post_count").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// Public mirror content remains immutable in R2. Owner review decisions and
// evaluation runs are small, transactional overlays in D1.
export const commentReviewDecisions = sqliteTable("comment_review_decisions", {
  postId: text("post_id").notNull(),
  commentId: text("comment_id").notNull(),
  packetHash: text("packet_hash").notNull(),
  attributesJson: text("attributes_json").notNull(),
  note: text("note").notNull().default(""),
  reviewerId: text("reviewer_id").notNull(),
  reviewedAt: text("reviewed_at").notNull(),
}, (t) => [primaryKey({ columns: [t.postId, t.commentId] }), index("idx_review_post").on(t.postId)]);

export const evaluationQuestions = sqliteTable("evaluation_questions", {
  id: text("id").primaryKey(),
  question: text("question").notNull(),
  category: text("category").notNull(),
  referenceAnswer: text("reference_answer").notNull().default(""),
  rubric: text("rubric").notNull().default(""),
  signalsJson: text("signals_json").notNull().default("[]"),
  minimumEvidence: integer("minimum_evidence").notNull().default(1),
  createdAt: text("created_at").notNull(),
});

export const evaluationRuns = sqliteTable("evaluation_runs", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  status: text("status").notNull(),
  configJson: text("config_json").notNull(),
  questionsJson: text("questions_json").notNull(),
  metricsJson: text("metrics_json").notNull().default("{}"),
  sourceSignature: text("source_signature").notNull(),
  completedAt: text("completed_at"),
}, (t) => [index("idx_eval_runs_created").on(t.createdAt)]);

export const evaluationResults = sqliteTable("evaluation_results", {
  runId: text("run_id").notNull().references(() => evaluationRuns.id, { onDelete: "cascade" }),
  questionId: text("question_id").notNull(),
  resultJson: text("result_json").notNull(),
  humanCorrect: integer("human_correct"),
  humanNote: text("human_note"),
  gradedAt: text("graded_at"),
}, (t) => [primaryKey({ columns: [t.runId, t.questionId] })]);

// The full processed JSON package lives in R2.  This table is deliberately
// small: it makes each published dataset snapshot auditable without copying
// a multi-megabyte document into D1.
export const datasetArchives = sqliteTable(
  "dataset_archives",
  {
    snapshotId: text("snapshot_id")
      .primaryKey()
      .references(() => snapshots.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    sha256: text("sha256").notNull(),
    byteCount: integer("byte_count").notNull(),
    postCount: integer("post_count").notNull(),
    uploadedAt: text("uploaded_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_dataset_archives_uploaded").on(table.uploadedAt)],
);

export const webUsers = sqliteTable("web_users", {
  email: text("email").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("viewer"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastLoginAt: text("last_login_at"),
}, (table) => [
  check("web_users_role", sql`${table.role} IN ('viewer')`),
  check("web_users_status", sql`${table.status} IN ('active','disabled')`),
]);

export const webAuthRate = sqliteTable("web_auth_rate", {
  subject: text("subject").primaryKey(),
  window: integer("window").notNull(),
  count: integer("count").notNull().default(1),
});

// Enterprise records are deliberately disjoint from the public demo tables.
// Every child identity includes its tenant and is enforced by a composite FK.
export const organizations = sqliteTable("ent_organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdBy: text("created_by").notNull(),
  activeSnapshotId: text("active_snapshot_id"),
  revision: integer("revision").notNull().default(0),
  createdAt: text("created_at").notNull(),
});
export const memberships = sqliteTable("ent_memberships", {
  tenantId: text("tenant_id").notNull().references(() => organizations.id),
  userId: text("user_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => [primaryKey({ columns: [t.tenantId, t.userId] }),
  index("idx_ent_members_user").on(t.userId),
  check("ent_member_role", sql`${t.role} IN ('owner','admin','analyst','viewer')`)]);
export const enterpriseSnapshots = sqliteTable("ent_snapshots", {
  tenantId: text("tenant_id").notNull().references(() => organizations.id),
  id: text("id").notNull(),
  status: text("status").notNull().default("uploading"),
  expectedPosts: integer("expected_posts").notNull(),
  expectedBatches: integer("expected_batches").notNull(),
  receivedPosts: integer("received_posts").notNull().default(0),
  receivedBatches: integer("received_batches").notNull().default(0),
  byteCount: integer("byte_count").notNull().default(0),
  baseRevision: integer("base_revision").notNull(),
  dataCutoffAt: text("data_cutoff_at").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  publishedAt: text("published_at"),
  pipelineVersion: text("pipeline_version").notNull(),
}, (t) => [primaryKey({ columns: [t.tenantId, t.id] }),
  index("idx_ent_snapshots_tenant_status").on(t.tenantId, t.status),
  check("ent_snapshot_status", sql`${t.status} IN ('uploading','published','archived','aborted')`)]);
export const enterpriseDocuments = sqliteTable("ent_documents", {
  tenantId: text("tenant_id").notNull(),
  snapshotId: text("snapshot_id").notNull(),
  entityKey: text("entity_key").notNull(),
  payload: text("payload").notNull(),
  commentCount: integer("comment_count").notNull(),
  publishedAt: text("published_at"),
}, (t) => [primaryKey({ columns: [t.tenantId, t.snapshotId, t.entityKey] }),
  foreignKey({ columns: [t.tenantId, t.snapshotId], foreignColumns: [enterpriseSnapshots.tenantId, enterpriseSnapshots.id] })]);
export const enterpriseBatches = sqliteTable("ent_batches", {
  tenantId: text("tenant_id").notNull(),
  snapshotId: text("snapshot_id").notNull(),
  batchIndex: integer("batch_index").notNull(),
  digest: text("digest").notNull(),
}, (t) => [primaryKey({ columns: [t.tenantId, t.snapshotId, t.batchIndex] }),
  foreignKey({ columns: [t.tenantId, t.snapshotId], foreignColumns: [enterpriseSnapshots.tenantId, enterpriseSnapshots.id] })]);
export const enterpriseInvites = sqliteTable("ent_invites", {
  tokenHash: text("token_hash").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => organizations.id),
  email: text("email").notNull(),
  role: text("role").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedBy: text("used_by"),
}, (t) => [check("ent_invite_role", sql`${t.role} IN ('analyst','viewer')`)]);
export const enterpriseKeys = sqliteTable("ent_keys", {
  tokenHash: text("token_hash").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => organizations.id),
  createdBy: text("created_by").notNull(),
  label: text("label").notNull(),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
});
export const enterpriseAudit = sqliteTable("ent_audit", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => organizations.id),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  objectId: text("object_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => [index("idx_ent_audit_tenant_time").on(t.tenantId, t.createdAt)]);
export const enterpriseGuard = sqliteTable("ent_guard", {
  id: integer("id").primaryKey(),
  valid: integer("valid").notNull(),
}, (t) => [check("ent_precondition", sql`${t.valid} = 1`)]);
export const enterpriseRate = sqliteTable("ent_rate", {
  subject: text("subject").primaryKey(),
  window: integer("window").notNull(),
  count: integer("count").notNull(),
});

// Owner-operated cloud collection. Raw and processed payloads live in R2;
// D1 only holds bounded job state and searchable item metadata.
export const webCollectionJobs = sqliteTable("web_collection_jobs", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  platform: text("platform").notNull(),
  keyword: text("keyword").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  maxPosts: integer("max_posts").notNull(),
  pageCursor: text("page_cursor").notNull().default("{}"),
  candidateIds: text("candidate_ids").notNull().default("[]"),
  searchedPages: integer("searched_pages").notNull().default(0),
  processedCount: integer("processed_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [index("idx_web_collection_jobs_created").on(t.createdAt)]);

export const webCollectionItems = sqliteTable("web_collection_items", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => webCollectionJobs.id),
  platform: text("platform").notNull(),
  externalPostId: text("external_post_id").notNull(),
  title: text("title").notNull().default(""),
  sourceUrl: text("source_url").notNull().default(""),
  status: text("status").notNull().default("collected"),
  rawCommentCount: integer("raw_comment_count").notNull().default(0),
  validCommentCount: integer("valid_comment_count").notNull().default(0),
  summary: text("summary").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
  uniqueIndex("idx_web_collection_items_source").on(t.platform, t.externalPostId),
  index("idx_web_collection_items_job").on(t.jobId),
]);
