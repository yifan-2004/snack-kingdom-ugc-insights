# API reference

All routes are same-origin. JSON mutation requests use `Content-Type: application/json` unless explicitly listed as form routes. Examples below use fictional identifiers.

## Main workbench

| Method and path | Purpose | Access |
| --- | --- | --- |
| GET `/api/overview/latest` | Current mirror overview | Public sample/read model |
| GET `/api/overview/explorer` | Topic evidence, sentiment filters and charts | Read |
| GET `/api/overview/needs` | Grouped consumer questions and feedback | Read |
| GET `/api/processed-posts` | Processed post list | Read |
| GET `/api/processed-posts/:postId` | Contextual post detail | Read |
| GET `/api/processed-posts/:postId/packet` | Processed JSON packet | Read |
| GET `/api/processed-posts/time-tree` | Date hierarchy | Read |
| POST `/api/workbench/qa` | Mirror-based question answering | Public, rate limited |
| POST `/api/workbench/report` | Current-scope text report | Public, rate limited |
| GET `/api/workbench/session` | Owner session capability | Read |

Explorer parameters: `topic`, `kind=post|comment`, `sentiment=all|positive|negative|neutral|mixed|non_opinion`, `question_only=true`, `period=day|week|month`, `start`, `end`, `offset`, `limit` (maximum 100).

Q&A body:

```json
{ "question": "What do customers say about queue time?", "locale": "en" }
```

The response includes `answer`, `evidence`, `sources`, engine identifiers, capability flags and `dataScope`. Evidence includes chunk ID, parent-post ID, excerpt and source URL.

## Comment review

| Method and path | Purpose |
| --- | --- |
| GET `/api/context-review` | Pending queue; supports `q`, `offset`, `limit` |
| POST `/api/context-review` | Owner saves a version-checked decision |
| GET `/api/context-review/decisions` | Owner exports persisted decisions |

```json
{
  "post_id": "demo-p1",
  "comment_id": "demo-c2",
  "expected_packet_hash": "demo-packet-v1",
  "attributes": {
    "target": "brand",
    "sentiment": "neutral",
    "description": "Question about quiet visiting hours",
    "evidence": ["When is the queue shortest?"]
  },
  "note": "Question, not an expressed complaint."
}
```

Evidence must occur verbatim in the source comment. Targets are `brand|blogger|other` in this review contract; this vocabulary is intentionally documented separately from the collection model's `creator|unclear` values. Brand sentiments support `positive|neutral|negative|mixed`. Non-brand targets have no brand sentiment.

Successful writes return `derived_refresh_required: true`. Packet changes or an already reviewed identical version return 409.

## Evaluation

| Method and path | Purpose |
| --- | --- |
| GET / POST `/api/evaluation/questions` | Read question bank / owner adds a question |
| GET / POST `/api/evaluation/runs` | Read history / owner creates a run |
| GET `/api/evaluation/runs/:runId` | Current run state |
| POST `/api/evaluation/runs/:runId/step` | Owner executes the next bounded batch |
| POST `/api/evaluation/grade` | Owner records correctness and rationale |
| POST `/api/evaluation/cancel` | Owner cancels a run |

Run creation accepts `question_ids`, `engine=serial|parallel` and `concurrency`. At most 200 selected questions and four concurrent questions per step are allowed. A grade requires `run_id`, `question_id`, boolean `correct` and nonempty `note`.

## Collection

All collection routes require an owner session.

| Method and path | Purpose |
| --- | --- |
| GET / POST `/api/web-collection/jobs` | List / create jobs |
| GET `/api/web-collection/jobs/:jobId/items` | Collected records |
| POST `/api/web-collection/jobs/:jobId/step` | Run one search or processing step |
| POST `/api/web-collection/jobs/:jobId/retry` | Resume a failed job |
| GET `/api/web-collection/packet/:platform/:postId` | Download a processed record |

Creation accepts `keyword`, ISO-date `start_date`, `end_date`, and integer `max_posts` from 1 to 10. Only one active job is accepted. Results are separate from the published overview.

## Machine and structured APIs

`/api/sync/mirror`, `/api/sync/posts` and `/api/sync/archive` require explicit enablement and the server-configured `SYNC_TOKEN_V2`. Mirror upload additionally uses `x-mirror-key` with an allowlisted JSON object key. Reset uses a separate `RESET_TOKEN_V2` and explicit `RESET_SYNC_DATA` confirmation.

`/api/posts`, `/api/topics`, `/api/rag`, `/api/rag/benchmark`, `/api/report` and `/api/system/status` expose the structured snapshot path. `/api/analysis/*` is an owner-authenticated optional external computation gateway; it reports unavailability when unconfigured.

## Errors

Typical statuses: 400 invalid input; 401 missing/invalid machine credential; 403 missing owner privilege or rejected origin; 404 missing record; 409 changed version, conflicting job or invalid lifecycle; 410 retired endpoint; 413 oversized body; 429 throttling; 503 missing runtime service.

Some retained routes return `error`; workbench routes generally return `detail`. Clients must not assume all endpoints share one error envelope.
