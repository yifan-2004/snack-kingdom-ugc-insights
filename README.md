# Snack Kingdom · UGC Insights

A social-listening workbench for turning scattered brand conversations into traceable consumer insights. The application connects posts and comments to canonical topics, separates brand opinions from unrelated reactions, and keeps business summaries linked to their source evidence.

## Product

- **Topic-first overview:** discussion-volume and engagement rankings, sentiment breakdowns, trend charts, and topic-level source exploration.
- **Content insights:** searchable posts, contextual comments, source links, and processed records.
- **Consumer feedback:** grouped questions and feedback, ranked by comment count plus total likes.
- **Comment review:** contextual classification, source-text evidence, version checks, and persistent reviewer decisions.
- **Reports and Q&A:** source-linked retrieval, scope-aware statistics, report export, and insufficient-evidence responses.
- **Collection workspace:** bounded TikHub collection, contextual Qwen analysis, retryable jobs, and downloadable JSON records.
- **System evaluation:** editable question sets, bounded concurrent execution, evidence checks, latency measurements, and separate manual grading.

## Engineering

| Layer | Implementation |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| Backend | TypeScript HTTP routes, Vinext, Worker runtime |
| Persistence | D1 / SQLite-compatible tables, Drizzle migrations, R2 object storage |
| Analysis | Context-aware classification, topic normalization, opinion/intent separation |
| Retrieval | Source-linked lexical retrieval; LangChain orchestration for the structured dataset API |
| Access control | Signed email sessions, owner-only mutations, separate machine credentials |
| Verification | Type checks, production builds, unit tests and HTTP/database integration tests |

The public repository includes fictional sample records for previews. Actual collected content, credentials, local databases and historical evaluation results are not included. The web runtime and optional external analysis service have distinct capabilities; see the architecture documentation for those boundaries.

## Repository

- [Frontend](frontend/) — application shell, overview, content explorer, review, collection, reports and evaluation.
- [Backend](backend/) — HTTP routes, processing services, access control, storage and migrations.
- [Architecture](docs/architecture.md)
- [Data processing and contracts](docs/data-processing.md)
- [API reference](docs/api-reference.md)
- [Developer guide](docs/development.md)
- [Security and operational boundaries](docs/security.md)
- [Verification record](docs/verification.md)
