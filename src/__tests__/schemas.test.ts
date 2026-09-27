import { describe, it, expect } from "vitest";
import {
  DeepSeekSummarySchema,
  JevEvaluationSchema,
  TriageRequestSchema,
  PullRequestUrlSchema,
} from "@/lib/types";

describe("DeepSeekSummarySchema", () => {
  it("accepts a valid summary", () => {
    const ok = DeepSeekSummarySchema.safeParse({
      overview: "Changed session store.",
      behaviorChanged: ["Token now uses edge KV"],
      potentialImpact: ["Auth failures possible"],
      reviewFocus: ["Session expiry"],
      affectedFiles: ["src/session.ts"],
      affectedRoutes: ["/api/user"],
      suspiciousSignals: [],
    });
    expect(ok.success).toBe(true);
  });

  it("rejects missing overview", () => {
    const bad = DeepSeekSummarySchema.safeParse({
      behaviorChanged: [],
      potentialImpact: [],
      reviewFocus: [],
      affectedFiles: [],
      affectedRoutes: [],
      suspiciousSignals: [],
    });
    expect(bad.success).toBe(false);
  });

  it("rejects non-array fields", () => {
    const bad = DeepSeekSummarySchema.safeParse({
      overview: "ok",
      behaviorChanged: "not an array",
      potentialImpact: [],
      reviewFocus: [],
      affectedFiles: [],
      affectedRoutes: [],
      suspiciousSignals: [],
    });
    expect(bad.success).toBe(false);
  });
});

describe("JevEvaluationSchema", () => {
  it("accepts a valid evaluation", () => {
    const ok = JevEvaluationSchema.safeParse({
      riskScore: 0.88,
      confidence: 0.94,
      reviewRecommendation: "HUMAN_REVIEW",
      subsystem: "auth",
      securityFlawLikelihood: 0.5,
      riskAreas: [
        {
          category: "Session handling",
          severity: "HIGH",
          probability: 0.86,
          evidence: "Token changed",
        },
      ],
      rationale: "High risk.",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects out-of-range riskScore", () => {
    const bad = JevEvaluationSchema.safeParse({
      riskScore: 1.5,
      confidence: 0.8,
      reviewRecommendation: "HUMAN_REVIEW",
      subsystem: "auth",
      securityFlawLikelihood: 0.1,
      riskAreas: [],
      rationale: "x",
    });
    expect(bad.success).toBe(false);
  });

  it("rejects invalid severity", () => {
    const bad = JevEvaluationSchema.safeParse({
      riskScore: 0.5,
      confidence: 0.8,
      reviewRecommendation: "HUMAN_REVIEW",
      subsystem: "db",
      securityFlawLikelihood: 0.1,
      riskAreas: [
        {
          category: "x",
          severity: "CRITICAL",
          probability: 0.5,
          evidence: "y",
        },
      ],
      rationale: "x",
    });
    expect(bad.success).toBe(false);
  });

  it("rejects missing rationale", () => {
    const bad = JevEvaluationSchema.safeParse({
      riskScore: 0.5,
      confidence: 0.8,
      reviewRecommendation: "HUMAN_REVIEW",
      subsystem: "db",
      securityFlawLikelihood: 0.1,
      riskAreas: [],
    });
    expect(bad.success).toBe(false);
  });
});

describe("TriageRequestSchema", () => {
  it("accepts a valid request", () => {
    const ok = TriageRequestSchema.safeParse({
      pullRequestUrl: "https://github.com/org/repo/pull/1",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects an invalid URL", () => {
    const bad = TriageRequestSchema.safeParse({
      pullRequestUrl: "not-a-url",
    });
    expect(bad.success).toBe(false);
  });

  it("defaults forceRerun to false", () => {
    const ok = TriageRequestSchema.safeParse({
      pullRequestUrl: "https://github.com/org/repo/pull/1",
    });
    expect(ok.success && ok.data.forceRerun).toBe(false);
  });
});

describe("PullRequestUrlSchema", () => {
  it("rejects issue URLs", () => {
    expect(
      PullRequestUrlSchema.safeParse(
        "https://github.com/org/repo/issues/1"
      ).success
    ).toBe(false);
  });

  it("rejects commit URLs", () => {
    expect(
      PullRequestUrlSchema.safeParse(
        "https://github.com/org/repo/commit/abc"
      ).success
    ).toBe(false);
  });

  it("rejects URLs with non-numeric PR numbers", () => {
    expect(
      PullRequestUrlSchema.safeParse(
        "https://github.com/org/repo/pull/abc"
      ).success
    ).toBe(false);
  });
});
