# Security and operational boundaries

## Credentials and access

Provider keys, machine tokens and session secrets belong only in server configuration. The public repository contains empty configuration templates and known test values, not live credentials or actual UGC records.

Email sessions use HMAC signatures and HttpOnly, Secure, SameSite=Strict cookies. Weak signing secrets are rejected. Owner mutations check the signed role, current email allowlist and request origin. Client-supplied identity headers do not grant owner access.

Password verification uses salted PBKDF2. Form authentication has a persistent D1 attempt budget. Public application rate limits are mostly per-isolate best-effort controls; they are not a globally consistent abuse-prevention service.

## Input, output and data integrity

- Bound request bodies and constrain machine-upload object keys.
- Authenticate machine writes separately from browser sessions.
- Require a separate token and explicit confirmation for destructive resets.
- Keep source text as source text; do not execute model-produced instructions.
- Require review evidence to be a verbatim substring of the original comment.
- Compare packet hashes before saving a review decision.
- Keep correctness labels separate from automated evidence/latency checks.
- Do not count unreviewed automatic checks as human correctness scores.
- Treat static sample data as fictional, not as measured customer findings.

The model response currently receives basic shape/ID mapping checks, not a complete schema-level semantic validation. Duplicate/missing IDs, allowed-label enforcement and stricter schema validation remain hardening priorities before high-volume unattended processing.

## Retrieval boundaries

Hosted mirror answers use lexical evidence retrieval and deterministic response construction. The structured API uses LangChain orchestration but does not automatically provide a Chroma index or a model-generated answer. Capability flags must remain truthful.

Comments mentioning a creator should not become brand opinions. A match to a parent-post title alone is not sufficient evidence that its comment discusses the queried topic.

The collected sample does not establish representativeness, causation, sales lift or population-level sentiment. Engagement counts can be volatile and disproportionately influenced by a small number of posts.

## Operational limits

- Collection is explicitly stepped by the browser, not a durable unattended queue.
- At most ten posts per collection job; analysis is capped at sixty comments per post.
- Video content is excluded. Image interpretation is not implemented in the text-model call.
- Provider rate limits, platform access policies and API changes can interrupt a job.
- Collected JSON packets are not automatically compatible with the published desktop mirror.
- Review changes do not immediately recompute published rankings.
- Mirror uploads are object-by-object; the entire mirror does not yet have a transactional generation-pointer publication mechanism.
- Concurrent evaluation steps can duplicate computational work even though stored question results are deduplicated. Production scheduling should add per-run leases and atomic timing accumulation.
- Browser-rendered source records may contain personal information if a private operator publishes them. A public application must apply a redaction and consent/retention policy before mirror upload.

## Dependency review

At the verification date, `npm audit --omit=dev` reported no advisories for declared production dependencies. The complete development tree reported **7 high and 4 moderate** advisories, including nested glob-pattern tooling and an old transitive development-server binary.

The Cloudflare tooling was updated to compatible patched releases. Remaining build-tool advisories are not represented as resolved: do not expose development servers to untrusted networks or accept attacker-controlled build patterns. Recheck the lockfile against current upstream advisories before further use. A clean production-only package audit does not prove that the application or bundled artifact is vulnerability-free.

## Reporting

Report a suspected vulnerability privately to the repository owner with a minimal reproduction and affected version. Never attach live credentials or complete private datasets to a public issue.
