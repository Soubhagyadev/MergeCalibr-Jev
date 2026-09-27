import { z } from "zod";

// ─── GitHub ───────────────────────────────────────────────────────────────────

export const PullRequestUrlSchema = z
  .string()
  .regex(
    /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+$/,
    "Must be https://github.com/{owner}/{repo}/pull/{number}"
  );

export const GitHubRepoSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  number: z.number().int().positive(),
});
export type GitHubRepo = z.infer<typeof GitHubRepoSchema>;

export const PRMetadataSchema = z.object({
  title: z.string(),
  number: z.number(),
  author: z.string(),
  headRef: z.string(),
  baseRef: z.string(),
  headSha: z.string(),
  state: z.string(),
  htmlUrl: z.string(),
  filesChanged: z.number(),
  additions: z.number(),
  deletions: z.number(),
  repoFullName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PRMetadata = z.infer<typeof PRMetadataSchema>;

export const ChangedFileSchema = z.object({
  filename: z.string(),
  status: z.string(),
  additions: z.number(),
  deletions: z.number(),
  patch: z.string().optional(),
});
export type ChangedFile = z.infer<typeof ChangedFileSchema>;

// ─── DeepSeek ─────────────────────────────────────────────────────────────────

export const DeepSeekSummarySchema = z.object({
  overview: z.string().min(1),
  behaviorChanged: z.array(z.string()),
  potentialImpact: z.array(z.string()),
  reviewFocus: z.array(z.string()),
  affectedFiles: z.array(z.string()),
  affectedRoutes: z.array(z.string()),
  suspiciousSignals: z.array(z.string()),
});
export type DeepSeekSummary = z.infer<typeof DeepSeekSummarySchema>;

// ─── Jev ──────────────────────────────────────────────────────────────────────

const JevRiskAreaSchema = z.object({
  category: z.string().min(1),
  severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
  probability: z.number().min(0).max(1).finite(),
  evidence: z.string().min(1),
});

export const JevEvaluationSchema = z.object({
  riskScore: z.number().min(0).max(1).finite(),
  confidence: z.number().min(0).max(1).finite(),
  subsystem: z.string().min(1),
  securityFlawLikelihood: z.number().min(0).max(1).finite(),
  riskAreas: z.array(JevRiskAreaSchema).min(0),
  rationale: z.string().min(1),
});
export type JevEvaluation = z.infer<typeof JevEvaluationSchema>;

// ─── Triage decision ──────────────────────────────────────────────────────────

export const TriageDecisionSchema = z.enum([
  "LOW_RISK",
  "NEEDS_REVIEW",
  "ESCALATED",
]);
export type TriageDecision = z.infer<typeof TriageDecisionSchema>;

// ─── API ──────────────────────────────────────────────────────────────────────

export const TriageRequestSchema = z.object({
  pullRequestUrl: PullRequestUrlSchema,
  forceRerun: z.boolean().optional().default(false),
});
export type TriageRequest = z.infer<typeof TriageRequestSchema>;

export const TriageResultSchema = z.object({
  decision: TriageDecisionSchema,
  pullRequest: PRMetadataSchema,
  summary: DeepSeekSummarySchema,
  evaluation: JevEvaluationSchema,
  limitations: z.array(z.string()),
  scanKey: z.string(),
  requestId: z.string(),
  durationMs: z.number(),
  tokenUsage: z
    .object({
      deepseekPrompt: z.number().optional(),
      deepseekCompletion: z.number().optional(),
      jevPrompt: z.number().optional(),
      jevCompletion: z.number().optional(),
    })
    .optional(),
});
export type TriageResult = z.infer<typeof TriageResultSchema>;

export interface TriageResponseOk {
  data: TriageResult;
  error: null;
}

export interface TriageResponseErr {
  data: null;
  error: { code: string; message: string };
}

export type TriageResponse = TriageResponseOk | TriageResponseErr;

// ─── Error codes ─────────────────────────────────────────────────────────────

export const ERROR_CODES = {
  INVALID_URL: "INVALID_URL",
  PUBLIC_REPOSITORY_REQUIRED: "PUBLIC_REPOSITORY_REQUIRED",
  PR_NOT_FOUND: "PR_NOT_FOUND",
  GITHUB_RATE_LIMIT: "GITHUB_RATE_LIMIT",
  DIFF_UNAVAILABLE: "DIFF_UNAVAILABLE",
  OVERSIZED_PR: "OVERSIZED_PR",
  PROVIDER_FAILURE: "PROVIDER_FAILURE",
  INVALID_MODEL_OUTPUT: "INVALID_MODEL_OUTPUT",
  RATE_LIMITED: "RATE_LIMITED",
  IN_FLIGHT: "IN_FLIGHT",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export class TriageError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = "TriageError";
  }
}
