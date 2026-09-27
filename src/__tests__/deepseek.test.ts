import { afterEach, describe, expect, it, vi } from "vitest";
import { summarizeWithDeepSeek } from "@/lib/deepseek";

const summary = {
  overview: "Updated the build script.",
  behaviorChanged: ["Build permissions are now configured cross-platform."],
  potentialImpact: ["Windows builds should no longer fail on chmod."],
  reviewFocus: ["Verify the build script on supported operating systems."],
  affectedFiles: ["package.json"],
  affectedRoutes: [],
  suspiciousSignals: [],
};

describe("summarizeWithDeepSeek", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("accepts valid JSON surrounded by model prose", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: `Here is the requested analysis:\n${JSON.stringify(summary)}\nThis is based only on the supplied diff.`,
                },
              },
            ],
          }),
          { status: 200 }
        )
      )
    );

    await expect(
      summarizeWithDeepSeek("PR #452: cross-platform build fix", "request-1")
    ).resolves.toMatchObject({ summary });
  });
});