import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateWithJev } from "@/lib/jev";
import type { DeepSeekSummary, PRMetadata } from "@/lib/types";

const summary: DeepSeekSummary = {
  overview: "Updated the build script.",
  behaviorChanged: ["Build permissions are now configured cross-platform."],
  potentialImpact: ["Windows builds should no longer fail on chmod."],
  reviewFocus: ["Verify the build script on supported operating systems."],
  affectedFiles: ["package.json"],
  affectedRoutes: [],
  suspiciousSignals: [],
};

const metadata: PRMetadata = {
  title: "fix: make build script cross-platform",
  number: 452,
  author: "octocat",
  headRef: "fix-build",
  baseRef: "main",
  headSha: "abc123",
  state: "open",
  htmlUrl: "https://github.com/org/repo/pull/452",
  filesChanged: 1,
  additions: 2,
  deletions: 1,
  repoFullName: "org/repo",
  createdAt: "2026-09-27T00:00:00Z",
  updatedAt: "2026-09-27T00:00:00Z",
};

const evaluation = {
  riskScore: 0.38,
  confidence: 0.84,
  reviewRecommendation: "HUMAN_REVIEW" as const,
  subsystem: "build tooling",
  securityFlawLikelihood: 0.02,
  riskAreas: [
    {
      category: "Cross-platform behavior",
      severity: "MEDIUM" as const,
      probability: 0.5,
      evidence: "The build command changed platform-specific behavior.",
    },
  ],
  rationale: "The change is limited to build tooling but needs platform coverage.",
};

describe("evaluateWithJev", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends only the parameters supported by Jev Router", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("JEV_MODEL", "typesafe/jev-router");

    let requestBody: Record<string, unknown> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(evaluation) } }],
            usage: { prompt_tokens: 100, completion_tokens: 50 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    const result = await evaluateWithJev(summary, metadata, "request-1");

    expect(result.evaluation).toEqual(evaluation);
    expect(requestBody).toEqual({
      model: "typesafe/jev-router",
      messages: [
        expect.objectContaining({ role: "system" }),
        expect.objectContaining({ role: "user" }),
      ],
    });
    expect(requestBody).not.toHaveProperty("max_tokens");
    expect(requestBody).not.toHaveProperty("temperature");
    expect(requestBody).not.toHaveProperty("response_format");
  });

  it("accepts a JSON response wrapped in a markdown fence", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "```json\n" + JSON.stringify(evaluation) + "\n```",
                },
              },
            ],
          }),
          { status: 200 }
        )
      )
    );

    await expect(evaluateWithJev(summary, metadata, "request-2")).resolves.toMatchObject({
      evaluation,
    });
  });

  it("accepts the documented Jev response without a review recommendation", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const { reviewRecommendation, ...documentedEvaluation } = evaluation;
    void reviewRecommendation;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: `Result:\n${JSON.stringify(documentedEvaluation)}` } }],
          })
        )
      )
    );

    await expect(evaluateWithJev(summary, metadata, "request-3")).resolves.toMatchObject({
      evaluation: documentedEvaluation,
    });
  });
});
