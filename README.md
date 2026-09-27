# MergeCallibr

<p align="center">
  <img src="assets/IBMBOB_Hackathon_Image.png" alt="MergeCallibr" width="720">
</p>

> **MergeCallibr is a probabilistic pull-request triage pipeline for public GitHub repositories. It uses DeepSeek to explain what a PR changes and Jev to produce calibrated risk and confidence signals. MergeCallibr classifies each PR as Low Risk, Needs Review, or Escalated, helping developers focus human attention where it matters most without modifying or merging code.**

MergeCallibr helps reviewers decide where to spend human attention before opening a pull request in depth. It accepts a public GitHub pull-request URL, retrieves the change, generates a structured impact summary, and evaluates risk through a deterministic triage policy.

## What it does

```text
Public GitHub PR
  -> GitHub metadata and changed-file patches
  -> DeepSeek change-impact summary
  -> Jev typed risk and confidence signals
  -> Deterministic triage decision
```

The dashboard presents the verdict, confidence, change impact, potential risk areas, and a diff preview. It also links back to the original GitHub pull request.

Possible decisions are:

- `LOW_RISK` - low risk with sufficient confidence and no strong security signal.
- `NEEDS_REVIEW` - uncertain, incomplete, oversized, or medium-risk evidence.
- `ESCALATED` - high risk, high-confidence risk, or a high-severity security signal.

The application calculates the final decision. Neither model approves, merges, comments on, or modifies code.

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
npm install
npm run dev
```

Add the required provider and GitHub credentials to `.env.local`. The example file contains the supported model, token-limit, and routing settings. Keep all secrets server-side and never commit `.env.local`.

Open [http://localhost:3000](http://localhost:3000) and paste a public GitHub pull-request URL.

## Tests

```bash
npm test
npm run lint
npm run build
```

## Security and scope

- Only public GitHub repositories are analyzed. Private, inaccessible, or unverifiable repositories are rejected.
- GitHub, OpenRouter, and Jev requests run server-side.
- GitHub credentials are never sent to model providers.
- The app does not write code, create commits, comment on pull requests, approve pull requests, or merge pull requests.
- It does not use GitHub webhooks, OAuth, user accounts, or a persistent database.

## Vercel deployment

Deploy the project to Vercel, configure the values from `.env.example` as Vercel Environment Variables, and keep them out of the client bundle. The triage endpoint uses the Node.js runtime with a bounded function duration.
