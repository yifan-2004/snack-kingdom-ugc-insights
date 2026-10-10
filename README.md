# Social Listening & LLM Analytics Platform

A social-listening workbench for **Snack Kingdom**, turning **849 posts and 12,738 comments from TikTok and RedNote** into sentiment distributions, ranked topics and evidence-backed business summaries.

## Project highlights

- **Contextual analysis:** classify brand relevance, sentiment and question intent with parent-post context and low-confidence review; combine embedding clustering with LLM topic normalization to rank themes by mentions and likes.
- **Grounded retrieval:** LangChain RAG with incremental indexing, source-linked answers and summaries, custom evaluation questions, batch testing and citation verification.
- **Parallel processing:** Ray-batched analysis and embedding generation achieved **7.9× throughput** on an **800-comment benchmark** (**2.67 vs. 0.34 comments/s**).

These highlights describe the full project. This repository contains the web application; the separate Python/Ray pipeline and vector index are not included. [Implementation scope →](docs/architecture.md)

## Interface preview

English interface with fictional sample records.

![Topic-first overview](docs/screenshots/overview.png)

<details>
<summary>More screenshots: comment review and evidence-linked Q&A</summary>

### Contextual comment review

![Contextual comment review](docs/screenshots/comment-review.png)

### Reports & Q&A

![Reports and evidence-linked Q&A](docs/screenshots/reports-qa.png)

</details>

<details>
<summary>Features and technical stack</summary>

**Workbench:** topic rankings and trends, searchable posts and comments, consumer-feedback groups, contextual review, collection jobs, source-linked reports and Q&A, and editable evaluation sets.

| Layer | Implementation |
| --- | --- |
| [Frontend](frontend/) | React, TypeScript, Vite |
| [Backend](backend/) | TypeScript, Vinext, Worker runtime |
| Storage | D1 / SQLite-compatible tables, Drizzle migrations, R2 |
| Web retrieval | Source-linked lexical retrieval and LangChain orchestration |
| Controls | Signed sessions, owner-only mutations, version-checked review |

Web evaluation uses bounded request concurrency, not Ray. Public source excludes collected content, credentials, local databases and historical benchmark artifacts.

</details>

## Documentation

[Architecture](docs/architecture.md) · [Data processing](docs/data-processing.md) · [API reference](docs/api-reference.md) · [Developer guide](docs/development.md) · [Security](docs/security.md) · [Verification](docs/verification.md)
