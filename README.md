# MergeCallibr

> **MergeCallibr is a probabilistic pull-request triage pipeline for public GitHub repositories. It uses DeepSeek to explain what a PR changes and Jev to produce calibrated risk and confidence signals. MergeCallibr classifies each PR as Low Risk, Needs Review, or Escalated, helping developers focus human attention where it matters most without modifying or merging code.**

## Stack

- **Next.js 16** (App Router, Node.js serverless)
- **TypeScript** (strict mode)
- **Zod** — schema validation for all model outputs
- **Octokit** — GitHub API (public repos only)
- **OpenRouter** — routes requests to DeepSeek and Jev
- **Vitest** — unit tests

## How it works

```
Public GitHub PR URL
  → GitHub API (public repo check + PR metadata + files)
  → Diff preparation (filter, chunk, token-limit)
  → DeepSeek summarization via OpenRouter
  → Jev typed evaluation via OpenRouter
  → Deterministic triage routing
  → LOW_RISK | NEEDS_REVIEW | ESCALATED
```

## Local development

```bash
cp .env.example .env.local
# Fill in OPENROUTER_API_KEY and GITHUB_API_TOKEN
npm install
npm run dev
```

## Tests

```bash
npm test
```

## Environment variables

| Variable | Description |
|---|---|
| `OPENROUTER_API_KEY` | API key for OpenRouter (used for both DeepSeek and Jev) |
| `OPENROUTER_BASE_URL` | OpenRouter base URL (default: `https://openrouter.ai/api/v1`) |
| `DEEPSEEK_MODEL` | DeepSeek model (default: `deepseek/deepseek-v4.1-flash`) |
| `JEV_MODEL` | Jev model (default: `typesafe/jev-latest`) |
| `GITHUB_API_TOKEN` | GitHub token to improve public API rate limits |
| `MAX_DIFF_INPUT_TOKENS` | Token limit for diff sent to DeepSeek (default: 18000) |
| `MAX_SUMMARY_OUTPUT_TOKENS` | Max tokens for DeepSeek output (default: 1200) |
| `MAX_JEV_INPUT_TOKENS` | Max tokens for Jev input (default: 6000) |
| `LOW_RISK_MAX` | Threshold below which a PR is LOW_RISK (default: 0.25) |
| `ESCALATED_MIN` | Threshold above which a PR is ESCALATED (default: 0.75) |
| `MIN_CONFIDENCE` | Minimum confidence required for LOW_RISK or ESCALATED (default: 0.70) |

## Vercel deployment

Configure all secrets as Vercel Environment Variables. The triage function runs on the Node.js runtime with a 120-second duration limit.

## Security

- All GitHub, OpenRouter, and Jev calls are server-side only.
- GitHub credentials are never sent to model providers.
- Only public repositories (`private: false`) are analyzed.
- A 404 from GitHub is not treated as proof that a repository is public.

## What MergeCallibr does NOT do

- It does not write code, commit changes, comment on PRs, approve PRs, or merge PRs.
- It does not access private repositories.
- It does not use GitHub webhooks or OAuth.
