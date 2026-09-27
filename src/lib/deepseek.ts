import {
  DeepSeekSummarySchema,
  type DeepSeekSummary,
  ERROR_CODES,
  TriageError,
} from "./types";

// Read at call-time — keys are never cached at module level and never sent to the client.
function getConfig() {
  return {
    baseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    model: process.env.DEEPSEEK_MODEL ?? "deepseek/deepseek-v4.1-flash",
    maxOutputTokens: parseInt(process.env.MAX_SUMMARY_OUTPUT_TOKENS ?? "1200", 10),
  };
}

// Stable system prompt — placed before the diff for prompt-cache hits.
const SYSTEM_PROMPT = `You are a precise pull-request change analyzer. Your job is to explain exactly what changed in a PR, not to approve, merge, or fix it.

Return a single JSON object with EXACTLY these keys:
{
  "overview": "Short plain-English description of the change.",
  "behaviorChanged": ["..."],
  "potentialImpact": ["..."],
  "reviewFocus": ["..."],
  "affectedFiles": ["..."],
  "affectedRoutes": ["..."],
  "suspiciousSignals": ["..."]
}

Rules:
- Use concrete file and route references, not vague generalities.
- Describe changed behavior and likely break points.
- Acknowledge uncertainty when evidence is incomplete.
- Do NOT invent facts not present in the diff.
- Do NOT produce Jev scores, security verdicts, or approve/reject recommendations.
- Do NOT wrap the JSON in a markdown code fence.
- All array values must be non-empty strings.
- If a category has no items, return an empty array [].`;

interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
  usage?: OpenRouterUsage;
  error?: { message?: string; code?: number };
}

export async function summarizeWithDeepSeek(
  diffContent: string,
  requestId: string
): Promise<{ summary: DeepSeekSummary; usage?: OpenRouterUsage }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new TriageError(
      ERROR_CODES.PROVIDER_FAILURE,
      "OpenRouter API key is not configured.",
      500
    );
  }

  const { baseUrl, model, maxOutputTokens } = getConfig();
  const userMessage = `Analyze this pull request diff and return the JSON summary:\n\n${diffContent}`;

  let raw: OpenRouterResponse;
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://mergecalibr.vercel.app",
        "X-Title": "MergeCallibr",
        "X-Request-Id": requestId,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        max_tokens: maxOutputTokens,
        temperature: 0.1,
        // deepseek/deepseek-v4.1-flash explicitly supports response_format
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (res.status === 429) {
      throw new TriageError(
        ERROR_CODES.RATE_LIMITED,
        "OpenRouter rate limit reached. Please try again shortly.",
        429
      );
    }

    raw = (await res.json()) as OpenRouterResponse;
  } catch (err) {
    if (err instanceof TriageError) throw err;
    throw new TriageError(
      ERROR_CODES.PROVIDER_FAILURE,
      "DeepSeek request failed.",
      502
    );
  }

  if (raw.error) {
    throw new TriageError(
      ERROR_CODES.PROVIDER_FAILURE,
      `DeepSeek provider error: ${raw.error.message ?? "unknown"}`,
      502
    );
  }

  const content = raw.choices?.[0]?.message?.content;
  if (!content) {
    throw new TriageError(
      ERROR_CODES.INVALID_MODEL_OUTPUT,
      "DeepSeek returned an empty response.",
      502
    );
  }

  let parsed: unknown;
  try {
    // Strip markdown code fences if the model wraps output (e.g. ```json ... ```)
    const stripped = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    parsed = JSON.parse(stripped);
  } catch {
    throw new TriageError(
      ERROR_CODES.INVALID_MODEL_OUTPUT,
      "DeepSeek returned non-JSON output.",
      502
    );
  }

  const result = DeepSeekSummarySchema.safeParse(parsed);
  if (!result.success) {
    throw new TriageError(
      ERROR_CODES.INVALID_MODEL_OUTPUT,
      `DeepSeek schema validation failed: ${result.error.issues[0]?.message ?? "unknown"}`,
      502
    );
  }

  return { summary: result.data, usage: raw.usage };
}

/**
 * For oversized PRs: summarize each chunk, then summarize the summaries.
 * If evidence is incomplete or conflicting, the caller must treat as NEEDS_REVIEW.
 */
export async function summarizeChunked(
  diffChunks: string[],
  requestId: string
): Promise<{ summary: DeepSeekSummary; limitations: string[] }> {
  const limitations: string[] = [];
  const chunkSummaries: string[] = [];

  for (let i = 0; i < diffChunks.length; i++) {
    const { summary } = await summarizeWithDeepSeek(
      `[Chunk ${i + 1}/${diffChunks.length}]\n${diffChunks[i]}`,
      `${requestId}-chunk${i}`
    );
    chunkSummaries.push(JSON.stringify(summary));
  }

  limitations.push(
    `PR was too large; analyzed in ${diffChunks.length} chunks. Evidence may be incomplete.`
  );

  const combinedInput = `These are ${diffChunks.length} partial summaries of a large PR. Combine them into one coherent summary. Be conservative: if evidence conflicts or is incomplete, reflect that in potentialImpact and suspiciousSignals.\n\n${chunkSummaries.join("\n\n---\n\n")}`;

  const { summary } = await summarizeWithDeepSeek(combinedInput, `${requestId}-merge`);
  return { summary, limitations };
}
