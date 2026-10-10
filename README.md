# Social Listening & LLM Analytics Platform

A social-listening platform for **Snack Kingdom**, a snack brand, connecting social-media collection, contextual comment analysis and evidence-backed consumer insights in one workbench.

## Project background

The end-to-end project crawled, cleaned and analyzed **849 posts and 12,738 comments from TikTok and RedNote**, producing sentiment distributions, topic-level insights and business summaries grounded in source evidence.

The goal is to identify what consumers are saying **about the brand**, not simply label every comment as positive or negative. Reactions to a creator, practical questions and unrelated discussion need different treatment before they can support a business conclusion.

## Core design

### 1. Contextual classification and topic analysis

- Preserve parent-post and reply context when classifying **brand relevance, sentiment and question intent**.
- Route low-confidence classifications to human review rather than treating uncertain predictions as confirmed findings.
- Combine **embedding clustering and LLM topic normalization** to consolidate similar expressions into canonical themes.
- Rank themes by **mentions and likes**, while keeping discussion volume, engagement and sentiment distinct.

### 2. Grounded RAG and evaluation

- Use **LangChain RAG with incremental indexing** to retrieve supporting posts and comments without rebuilding all unchanged records.
- Ground answers and summaries in identifiable source evidence so users can trace conclusions back to the original conversation.
- Support **custom question sets, batch testing and citation verification** to inspect answer quality and evidence support.

### 3. Parallel processing with Ray

Split comment-analysis and embedding-generation workloads into batches and execute them across a pool of Ray workers.

| Benchmark | Result |
| --- | --- |
| Workload | 800 comments |
| Sequential throughput | 0.34 comments/s |
| Ray parallel throughput | 2.67 comments/s |
| Throughput improvement | 7.9× |

These project-level measurements describe the separate Python/Ray processing pipeline, not the web runtime included in this repository. Benchmark artifacts are not included in the public source.

## Interface preview

Screenshots show the English interface with fictional sample records.

### Topic-first overview

Compare discussion volume, engagement and sentiment, then explore the posts and comments behind each topic.

![Topic-first overview](docs/screenshots/overview.png)

### Contextual comment review

Review each comment alongside its source post, classification and supporting context.

![Contextual comment review](docs/screenshots/comment-review.png)

### Reports & evidence-linked Q&A

Ask questions about the corpus and inspect the source excerpts supporting each answer.

![Reports and evidence-linked Q&A](docs/screenshots/reports-qa.png)

## Workbench features

- **Topic-first overview:** discussion-volume and engagement rankings, sentiment breakdowns, trend charts, and topic-level source exploration.
- **Content insights:** searchable posts, contextual comments, source links, and processed records.
- **Consumer feedback:** grouped questions and feedback, ranked by comment count plus total likes.
- **Comment review:** contextual classification, source-text evidence, version checks, and persistent reviewer decisions.
- **Reports and Q&A:** source-linked retrieval, scope-aware statistics, report export, and insufficient-evidence responses.
- **Collection workspace:** bounded TikHub collection, contextual Qwen analysis, retryable jobs, and downloadable JSON records.
- **System evaluation:** editable question sets, bounded concurrent execution, evidence checks, latency measurements, and separate manual grading.

## Web application stack

| Layer | Implementation |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| Backend | TypeScript HTTP routes, Vinext, Worker runtime |
| Persistence | D1 / SQLite-compatible tables, Drizzle migrations, R2 object storage |
| Analysis | Context-aware classification, topic normalization, opinion/intent separation |
| Retrieval | Source-linked lexical retrieval; LangChain orchestration for the structured dataset API |
| Access control | Signed email sessions, owner-only mutations, separate machine credentials |
| Verification | Type checks, production builds, unit tests and HTTP/database integration tests |

## Repository scope

This repository contains the **React web workbench, TypeScript backend, persistence schema and integration code**. The broader project's Python/Ray workers, embedding-clustering pipeline and incremental vector index are not included; the web application provides integration boundaries for an external analysis service.

The included web retrieval paths use source-linked lexical retrieval and LangChain orchestration for structured snapshots. Web evaluation uses bounded request concurrency, not Ray. See [Architecture](docs/architecture.md) for the implementation boundaries.

Public previews use **fictional sample records**. Collected social-media content, credentials, local databases and historical evaluation results are excluded.

## Repository

- [Frontend](frontend/) — application shell, overview, content explorer, review, collection, reports and evaluation.
- [Backend](backend/) — HTTP routes, processing services, access control, storage and migrations.
- [Architecture](docs/architecture.md)
- [Data processing and contracts](docs/data-processing.md)
- [API reference](docs/api-reference.md)
- [Developer guide](docs/development.md)
- [Security and operational boundaries](docs/security.md)
- [Verification record](docs/verification.md)
