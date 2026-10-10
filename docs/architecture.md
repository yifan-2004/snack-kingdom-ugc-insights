# Architecture

## System boundary

This repository contains the web application: its React workbench, request handlers, persistence schema, collection integration and verification code. The main user interface is English by default. Original source text is preserved rather than silently translated.

The frontend and backend are separate packages in one npm workspace. The frontend build produces assets under `backend/public/workbench`. The backend hosts those assets and the HTTP API at the same origin, avoiding cross-origin browser credentials.

```text
Browser workbench
  ├── Read model: overview, topics, posts, comments, reports
  ├── Owner workflow: review decisions and evaluation runs
  └── Collection workflow: explicit, bounded job steps
           │ same-origin HTTP
Worker request entry
  ├── Email authentication and security headers
  ├── HTTP route handlers
  ├── D1: jobs, decisions, question sets, results, structured snapshots
  └── R2: published mirror, archives, collected post packets
           │ authenticated outbound requests
       TikHub / Qwen / optional external analysis service
```

## Read models

Two storage paths coexist intentionally:

1. **Published mirror:** JSON objects for the main workbench. Overview, content details and source-linked Q&A share a compatible mirror snapshot. This path reuses already processed information.
2. **Structured snapshot API:** relational posts, comments, aspects and versioned snapshots. The `/api/rag` and `/api/report` routes use these tables and the LangChain orchestration module.

Do not assume changing one path automatically changes the other. A mirror refresh is a publication operation, not merely a collection completion event. `lib/local-mirror.ts` owns mirror access. Explicit `DEMO_DATA=true` selects fictional fixtures; it does not silently fall back to them after a production read failure.

## Collection

`lib/web-collection.ts` manages search pagination, stable platform IDs, comment retrieval, text normalization, model requests and JSON packet persistence. D1 stores progress; R2 stores raw staging and processed packets. Jobs are claimed before a step runs and stale busy jobs become retryable.

The browser currently requests each next step. Closing it pauses progress; saved data remains available. This is not an unattended scheduler. The current workflow excludes videos and processes small text-post batches. Image URLs are retained, but the text analysis request receives an image count, not a visual interpretation.

## Review and evaluation

Review decisions are separate from collected evidence and keyed by post/comment IDs plus an expected packet hash. A stale version returns a conflict instead of overwriting a newer decision. New decisions require a downstream refresh before aggregate dashboards change.

Evaluation runs copy their selected question definitions and store a source signature. A source change invalidates a run. Batches use bounded `Promise.all` concurrency, capped at four questions per step. Correctness labels remain unset until an authorized reviewer grades completed results.

## Optional computation service

`lib/analysis-gateway.ts` and `lib/workbench-gateway.ts` describe authenticated connections to an independently configured service. They fail closed when it is absent. The repository's Worker does not execute Python, Ray or Chroma. No external service source or performance claim is implied by the presence of gateway code.

## Modules

| Module | Responsibility |
| --- | --- |
| `frontend/src/features/overview` | Rankings, sentiment filters, trends, topic explorer, campaign chart |
| `frontend/src/features/content` | Post list and contextual detail |
| `frontend/src/features/review` | Review queue and evidence selection |
| `frontend/src/features/evaluation` | Questions, run controls and result grading |
| `frontend/src/features/hosted` | Web collection, reports and Q&A |
| `backend/lib/topic-pipeline.ts` | Deterministic normalization and aspect/topic extraction |
| `backend/lib/mirror-qa.ts` | Mirror retrieval and grounded response construction |
| `backend/lib/langchain-rag.ts` | Structured snapshot retrieval orchestration |
| `backend/db/schema.ts` | Persistence definitions |
| `backend/drizzle` | Ordered database migrations |

The enterprise service and its schema tests are retained compatibility code. The public enterprise route returns HTTP 410; they are not an active multi-tenant product feature.
