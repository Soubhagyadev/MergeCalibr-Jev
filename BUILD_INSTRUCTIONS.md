# MergeCallibr — MVP Build Instructions

Build **MergeCallibr**, a public-GitHub pull-request triage app that tells developers how much human attention a PR deserves.

```text
Public GitHub PR → DeepSeek summary → Jev typed evaluation → triage decision
```

MergeCallibr does not write code, commit changes, comment on PRs, approve PRs, merge PRs, or run IBM Bob inside the product. IBM Bob 2.0 is only the coding agent used to build this project.

## Outcomes

- **LOW_RISK:** low risk and high confidence; no deep human review is required.
- **NEEDS_REVIEW:** medium risk, low confidence, incomplete evidence, or an oversized diff.
- **ESCALATED:** high risk and high confidence, or a high-severity security signal.

The application—not an LLM—must calculate the final enum with deterministic thresholds.

## Scope

### Build

- Scan page with a GitHub pull-request URL field.
- Public repository and PR validation.
- GitHub metadata, changed-file, and patch retrieval.
- DeepSeek summarization through OpenRouter.
- Jev typed evaluation.
- Deterministic triage routing.
- Light, editorial two-pane dashboard matching the Paper design.
- Loading, error, rate-limit, oversized-PR, and provider-failure states.
- Link to the original GitHub PR and a diff preview.

### Do not build

- Private repository access.
- GitHub webhooks, OAuth, or user accounts.
- IBM Bob execution or Actor-Critic remediation.
- Automatic fixes, commits, comments, approvals, or merges.
- A persistent database or background queue for the first demo.

## Stack

- TypeScript with strict mode
- Next.js or another Vercel-compatible framework
- Node.js serverless route for `/api/triage`
- React
- Octokit
- Zod
- OpenRouter via `fetch` for both model calls
- Vitest

Do not depend on a long-running process, local filesystem, or durable in-memory state.

## Environment

Create `.env.example`:

```env
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
DEEPSEEK_MODEL=deepseek/deepseek-v4.1-flash
JEV_MODEL=typesafe/jev-latest
GITHUB_API_TOKEN=

MAX_DIFF_INPUT_TOKENS=18000
MAX_SUMMARY_OUTPUT_TOKENS=1200
MAX_JEV_INPUT_TOKENS=6000
LOW_RISK_MAX=0.25
ESCALATED_MIN=0.75
MIN_CONFIDENCE=0.70
```

Use `OPENROUTER_API_KEY` for both DeepSeek and Jev requests routed through
OpenRouter. Use `GITHUB_API_TOKEN` only for GitHub API requests. Keep secrets
only in Vercel environment variables; never expose or log them.

## Public GitHub-only behavior

Accept only:

```text
https://github.com/{owner}/{repo}/pull/{number}
```

Reject other hosts, issue URLs, commit URLs, malformed URLs, and invalid PR numbers.

Use Octokit to fetch:

1. `GET /repos/{owner}/{repo}`
2. `GET /repos/{owner}/{repo}/pulls/{number}`
3. `GET /repos/{owner}/{repo}/pulls/{number}/files`

Continue only when repository metadata explicitly says `private: false`.

If the repository is private, inaccessible, or visibility cannot be verified, stop with:

```text
PUBLIC_REPOSITORY_REQUIRED
```

Do not treat an ambiguous `404` as proof that a repository is public. The
`GITHUB_API_TOKEN` may improve public API rate limits, but it must never be used
to fetch private data. Verify `private: false` before reading PR files.

## API

Implement:

```http
POST /api/triage
Content-Type: application/json
```

Request:

```json
{
  "pullRequestUrl": "https://github.com/org/repo/pull/123"
}
```

Return:

```json
{
  "data": {
    "decision": "ESCALATED",
    "pullRequest": {},
    "summary": {},
    "evaluation": {},
    "limitations": []
  },
  "error": null
}
```

or:

```json
{
  "data": null,
  "error": {
    "code": "PUBLIC_REPOSITORY_REQUIRED",
    "message": "MergeCallibr only analyzes public GitHub repositories."
  }
}
```

Use explicit errors for invalid URLs, missing PRs, GitHub rate limits, unavailable diffs, provider failures, malformed model output, and oversized PRs.

## Diff preparation

Send DeepSeek PR metadata and meaningful changed-file patches—not the entire repository.

Keep source, tests, migrations, API schemas, authentication code, and infrastructure configuration. Exclude or de-prioritize binaries, images, generated files, minified assets, lockfiles, vendored dependencies, build output, coverage, and large snapshots.

Target limits:

- DeepSeek input: 18,000 tokens
- DeepSeek output: 1,200 tokens
- Jev input: 6,000 tokens

For an oversized diff, split into deterministic 8,000–10,000-token chunks, summarize each, then summarize the summaries. If evidence remains incomplete or conflicting, return `NEEDS_REVIEW`; never return `LOW_RISK`.

## DeepSeek contract

Call OpenRouter with:

```text
POST ${OPENROUTER_BASE_URL}/chat/completions
model: ${DEEPSEEK_MODEL}
```

The expected model value is `deepseek/deepseek-v4.1-flash`.

DeepSeek explains the change. It does not make the final decision.

Require validated JSON:

```json
{
  "overview": "Short plain-English description.",
  "behaviorChanged": ["..."],
  "potentialImpact": ["..."],
  "reviewFocus": ["..."],
  "affectedFiles": ["..."],
  "affectedRoutes": ["..."],
  "suspiciousSignals": ["..."]
}
```

Require concrete file/route references, changed behavior, likely break points, uncertainty when evidence is incomplete, and no invented facts. Do not ask it to approve, merge, or fix code, or to produce Jev scores.

Place stable instructions and schema before the unique diff to allow prompt-cache hits. The diff itself is usually unique and will often be a cache miss.

## Jev contract

Call the same OpenRouter endpoint with:

```text
POST ${OPENROUTER_BASE_URL}/chat/completions
model: ${JEV_MODEL}
```

The expected model value is `typesafe/jev-latest`. Use Jev's typed response
format if the routed model/provider supports it. If the provider returns
unstructured or malformed output, fail explicitly rather than inventing a
verdict.

Send Jev the validated summary and PR metadata, not the raw diff.

Request typed values:

```ts
{
  riskScore: number;              // 0..1
  confidence: number;             // 0..1
  subsystem: string;
  securityFlawLikelihood: number; // 0..1
  riskAreas: Array<{
    category: string;
    severity: "LOW" | "MEDIUM" | "HIGH";
    probability: number;          // 0..1
    evidence: string;
  }>;
  rationale: string;
}
```

Reject missing, non-finite, or out-of-range values. Jev is a typed evaluator, not a prose chatbot.

## Routing

```ts
if (riskScore >= ESCALATED_MIN && confidence >= MIN_CONFIDENCE) {
  decision = "ESCALATED";
} else if (
  riskScore <= LOW_RISK_MAX &&
  confidence >= MIN_CONFIDENCE &&
  securityFlawLikelihood < LOW_RISK_MAX
) {
  decision = "LOW_RISK";
} else {
  decision = "NEEDS_REVIEW";
}
```

Force `ESCALATED` for high-severity security areas or sensitive changes involving authentication, authorization, sessions, cryptography, secrets, payments, or data migrations.

Low confidence, missing patches, oversized input, and provider uncertainty must never produce `LOW_RISK`.

## Dashboard UI

Preserve the light, editorial two-pane layout.

### Scan page

Center:

```text
START A TRIAGE
Scan a GitHub pull request
Paste a public GitHub PR link.
[ URL input ] [Scan PR]
DeepSeek summarizes → Jev evaluates → MergeCallibr recommends
```

Show idle, validating, fetching, summarizing, evaluating, complete, invalid URL, private repository, rate-limit, provider failure, and oversized-PR states.

### Left pane

Show repository name, filters, and PR rows with title, number, author/branch, state, and risk score:

```text
✓ Low risk
⚠ Needs review
● Escalated
```

Do not rely on color alone.

### Right pane

Use this order:

1. PR title and GitHub metadata
2. Pipeline strip
3. Prominent `JEV VERDICT` card
4. DeepSeek change-impact summary
5. Potential risk areas
6. Diff preview
7. Actions

Example:

```text
JEV VERDICT
HIGH RISK       0.88
CONFIDENCE      94%
HUMAN REVIEW REQUIRED
Reason: Session token handling changed.
```

The summary must be structured:

```text
CHANGE IMPACT · DEEPSEEK

Behavior changed
...

Potential impact
...

Review focus
...
```

Show risk signals separately:

```text
POTENTIAL RISK AREAS
Session token handling     0.86
Access control             0.64
Error handling             0.31
```

Label these as risk signals, not confirmed vulnerabilities.

Allowed actions: **Open PR on GitHub**, **View full diff**, and **Re-run triage**. Do not include Bob, automatic fix, commit, approve, or merge actions.

## Security and reliability

- Keep GitHub, OpenRouter, and Jev calls server-side.
- Never send GitHub credentials to model providers.
- Redact keys and authorization headers.
- Do not log raw prompts or full diffs by default.
- Add request IDs, timeouts, and bounded retries.
- Return explicit errors; never return a fake low-risk result.

## Request deduplication and cost protection

The application must avoid accidental repeated model calls. A user clicking
**Scan PR** multiple times must not create multiple DeepSeek or Jev requests
for the same PR revision.

Implement all of the following:

- Disable the Scan button while a scan is running.
- Add server-side in-flight request deduplication.
- Create a deterministic scan key from:
  - repository and PR number
  - head commit SHA
  - summarizer model/version
  - Jev model/version
  - prompt/schema version
- Reuse a completed result when the scan key is unchanged.
- Do not reuse a result after the PR head SHA changes.
- Add a short server-side cooldown for identical repeated requests.
- Show progress states instead of starting a second request:
  `Fetching PR`, `Summarizing`, `Evaluating`, and `Preparing verdict`.
- Allow a deliberate **Re-run triage** action, which bypasses the completed-result
  cache only when the user explicitly requests it.
- Apply conservative server-side rate limiting per IP/session.
- Never rely only on frontend button disabling for cost protection.
- Record provider-reported token usage and cost when available, without exposing
  API keys or account-balance details.

Use a short-lived cache suitable for the deployment environment. If durable
cross-instance caching is unavailable on Vercel, keep the first demo's behavior
safe by rejecting duplicate in-flight scans and returning a clear retry message
instead of issuing parallel model calls.

## Tests

Test URL parsing, public/private handling, ambiguous `404`, diff filtering, token limits, oversized PR fallback, DeepSeek schema validation, Jev score validation, all three routing outcomes, low confidence behavior, high-severity escalation, rate limits, provider failures, and the `/api/triage` route.

## Vercel

- Deploy the frontend and Node.js API route to Vercel.
- Configure all secrets as Vercel Environment Variables.
- Use Node.js runtime for the triage route.
- Set a bounded function duration.
- Keep the first version synchronous.
- Do not depend on local files or persistent process memory.
- Add a job/polling flow only if real PRs exceed the function duration.

## Definition of done

- Public PR URL produces a result.
- Private or unverifiable repositories are rejected.
- DeepSeek returns a validated change-impact summary.
- Jev returns validated typed signals.
- Deterministic code returns `LOW_RISK`, `NEEDS_REVIEW`, or `ESCALATED`.
- UI clearly explains the decision and likely break areas.
- Original PR and diff can be opened.
- No code is modified, committed, approved, or merged.
- Tests, lint, and production build pass.

## README description

> **MergeCallibr is a probabilistic pull-request triage pipeline for public GitHub repositories. It uses DeepSeek to explain what a PR changes and Jev to produce calibrated risk and confidence signals. MergeCallibr classifies each PR as Low Risk, Needs Review, or Escalated, helping developers focus human attention where it matters most without modifying or merging code.**
