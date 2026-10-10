CREATE TABLE `aspects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comment_id` integer NOT NULL,
	`topic_id` text,
	`evidence_text` text NOT NULL,
	`normalized_text` text DEFAULT '' NOT NULL,
	`sentiment` text DEFAULT 'neutral' NOT NULL,
	`sentiment_score` integer DEFAULT 0 NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`match_score` integer DEFAULT 0 NOT NULL,
	`assignment_status` text DEFAULT 'matched' NOT NULL,
	`processing_version` text DEFAULT 'pipeline-v1' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_aspects_comment_id` ON `aspects` (`comment_id`);--> statement-breakpoint
CREATE INDEX `idx_aspects_topic_sentiment` ON `aspects` (`topic_id`,`sentiment`);--> statement-breakpoint
CREATE TABLE `content_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_key` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`content_hash` text NOT NULL,
	`raw_text` text DEFAULT '' NOT NULL,
	`normalized_text` text DEFAULT '' NOT NULL,
	`observed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_content_versions_entity_hash` ON `content_versions` (`entity_type`,`entity_key`,`content_hash`);--> statement-breakpoint
CREATE INDEX `idx_content_versions_entity_version` ON `content_versions` (`entity_type`,`entity_key`,`version`);--> statement-breakpoint
CREATE TABLE `engagement_observations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_key` text NOT NULL,
	`like_count` integer DEFAULT 0 NOT NULL,
	`comment_count` integer DEFAULT 0 NOT NULL,
	`share_count` integer DEFAULT 0 NOT NULL,
	`observed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_engagement_entity_observed` ON `engagement_observations` (`entity_type`,`entity_key`,`observed_at`);--> statement-breakpoint
CREATE TABLE `processing_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_id` text,
	`status` text DEFAULT 'processing' NOT NULL,
	`received_count` integer DEFAULT 0 NOT NULL,
	`processed_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`error_json` text DEFAULT '{}' NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`snapshot_id`) REFERENCES `snapshots`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_processing_runs_snapshot_status` ON `processing_runs` (`snapshot_id`,`status`);--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'candidate' NOT NULL,
	`data_cutoff_at` text NOT NULL,
	`pipeline_version` text DEFAULT 'pipeline-v2' NOT NULL,
	`cleaning_version` text DEFAULT 'clean-v2' NOT NULL,
	`topic_version` text DEFAULT 'topic-v1' NOT NULL,
	`index_version` text DEFAULT 'langchain-v1' NOT NULL,
	`post_count` integer DEFAULT 0 NOT NULL,
	`comment_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`published_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_snapshots_status_created` ON `snapshots` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `topic_candidates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`normalized_label` text NOT NULL,
	`sample_json` text DEFAULT '[]' NOT NULL,
	`mention_count` integer DEFAULT 1 NOT NULL,
	`distinct_post_count` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'collecting' NOT NULL,
	`ai_decision_json` text DEFAULT '{}' NOT NULL,
	`first_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_topic_candidates_label` ON `topic_candidates` (`normalized_label`);--> statement-breakpoint
CREATE INDEX `idx_topic_candidates_status_count` ON `topic_candidates` (`status`,`mention_count`);--> statement-breakpoint
CREATE TABLE `topics` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`origin` text DEFAULT 'preset' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`aliases_json` text DEFAULT '[]' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_topics_parent_status` ON `topics` (`parent_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_topics_origin_status` ON `topics` (`origin`,`status`);--> statement-breakpoint
INSERT OR IGNORE INTO `topics` (`id`, `parent_id`, `name`, `description`) VALUES
  ('product_experience', NULL, '产品体验', '产品口味、口感、新鲜度与品类体验'),
  ('price_value', NULL, '价格与价值', '价格、份量、折扣与性价比'),
  ('health_ingredients', NULL, '配料与健康', '热量、添加剂、配料与食品安全'),
  ('packaging', NULL, '包装与规格', '包装设计、密封、份量和规格'),
  ('service_experience', NULL, '服务体验', '排队、结账、员工与售后服务'),
  ('store_experience', NULL, '门店体验', '门店环境、卫生、拥挤和陈列'),
  ('purchase_channel', NULL, '购买与渠道', '购买渠道、缺货、物流和配送'),
  ('consumer_intention', NULL, '消费意愿', '复购、推荐、尝试或放弃购买'),
  ('brand_competitor', NULL, '品牌与竞品', '品牌印象、竞品和替代产品'),
  ('marketing', NULL, '营销传播', '广告、种草、促销和联名传播'),
  ('product_taste', 'product_experience', '产品口味', '与产品口味有关的用户表达'),
  ('sweetness', 'product_experience', '甜度', '与甜度有关的用户表达'),
  ('texture', 'product_experience', '产品口感', '与产品口感有关的用户表达'),
  ('product_price', 'price_value', '产品价格', '与产品价格有关的用户表达'),
  ('value_for_money', 'price_value', '性价比', '与性价比有关的用户表达'),
  ('portion_size', 'packaging', '产品份量', '与产品份量有关的用户表达'),
  ('packaging_design', 'packaging', '包装设计', '与包装设计有关的用户表达'),
  ('ingredients', 'health_ingredients', '配料与添加剂', '与配料和添加剂有关的用户表达'),
  ('calories', 'health_ingredients', '热量与健康', '与热量和健康有关的用户表达'),
  ('queue_time', 'service_experience', '排队时长', '与排队时长有关的用户表达'),
  ('staff_service', 'service_experience', '员工服务', '与员工服务有关的用户表达'),
  ('store_crowding', 'store_experience', '门店拥挤', '与门店拥挤有关的用户表达'),
  ('store_environment', 'store_experience', '门店环境', '与门店环境有关的用户表达'),
  ('availability', 'purchase_channel', '库存与补货', '与库存和补货有关的用户表达'),
  ('delivery', 'purchase_channel', '物流与配送', '与物流和配送有关的用户表达'),
  ('repurchase_intention', 'consumer_intention', '复购意愿', '与复购意愿有关的用户表达'),
  ('recommendation_intention', 'consumer_intention', '推荐意愿', '与推荐意愿有关的用户表达'),
  ('competitor_comparison', 'brand_competitor', '竞品比较', '与竞品比较有关的用户表达'),
  ('promotion', 'marketing', '促销与种草', '与促销和种草有关的用户表达');--> statement-breakpoint
DROP INDEX `idx_posts_external_id`;--> statement-breakpoint
ALTER TABLE `posts` ADD `content_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `content_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `processing_status` text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `first_seen_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `last_seen_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `posts` SET `first_seen_at` = CURRENT_TIMESTAMP, `last_seen_at` = CURRENT_TIMESTAMP WHERE `first_seen_at` = '' OR `last_seen_at` = '';--> statement-breakpoint
CREATE UNIQUE INDEX `idx_posts_platform_external_id` ON `posts` (`platform`,`external_id`);--> statement-breakpoint
ALTER TABLE `comments` ADD `external_id` text;--> statement-breakpoint
ALTER TABLE `comments` ADD `parent_external_id` text;--> statement-breakpoint
ALTER TABLE `comments` ADD `raw_content` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` ADD `clean_content` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` ADD `content_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` ADD `quality_score` integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` ADD `cleaning_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` ADD `is_current` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` ADD `synced_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `comments` SET `synced_at` = CURRENT_TIMESTAMP WHERE `synced_at` = '';--> statement-breakpoint
CREATE INDEX `idx_comments_post_current` ON `comments` (`post_id`,`is_current`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_comments_post_external_id` ON `comments` (`post_id`,`external_id`);
