import {
  JevEvaluationSchema,
  type JevEvaluation,
  type DeepSeekSummary,
  type PRMetadata,
  ERROR_CODES,
  TriageError,
} from "./types";

// Read at call-time — keys are never cached at module level and never sent to the client.
function getConfig() {
  return {
    baseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    model: process.env.JEV_MODEL ?? "typesafe/jev-router",
    maxInputTokens: parseInt(process.env.MAX_JEV_INPUT_TOKENS ?? "6000", 10),
  };
}

const SYSTEM_PROMPT = `You are Jev, a typed risk evaluator for pull requests. You receive a structured change-impact summary and PR metadata. You return calibrated risk and confidence signals as a JSON object.

Return EXACTLY this JSON structure (no prose, no markdown fences):
{
  "riskScore": <number 0..1>,
  "confidence": <number 0..1>,
  "subsystem": "<string>",
  "securityFlawLikelihood": <number 0..1>,
  "riskAreas": [
    {
      "category": "<string>",
      "severity": "LOW" | "MEDIUM" | "HIGH",
      "probability": <number 0..1>,
      "evidence": "<string>"
    }
  ],
  "rationale": "<string>"
}

Rules:
- All numeric fields must be finite numbers in [0, 1].
- riskAreas may be empty [].
- severity must be exactly "LOW", "MEDIUM", or "HIGH".
- Base scores on the summary evidence; do not invent facts.
- Do NOT make approval/merge decisions. You are a typed signal source only.`;

interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: OpenRouterUsage;
  error?: { message?: string };
}

function parseJevContent(content: string): unknown {
  const normalized = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  try {
    return JSON.parse(normalized);
  } catch {
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("No JSON object found");
    return JSON.parse(normalized.slice(start, end + 1));
  }
}

export async function evaluateWithJev(
  summary: DeepSeekSummary,
  metadata: PRMetadata,
  requestId: string
): Promise<{ evaluation: JevEvaluation; usage?: OpenRouterUsage }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new TriageError(
      ERROR_CODES.PROVIDER_FAILURE,
      "OpenRouter API key is not configured.",
      500
    );
  }

  const { baseUrl, model, maxInputTokens } = getConfig();

  const userPayload = {
    pullRequest: {
      title: metadata.title,
      number: metadata.number,
      author: metadata.author,
      headRef: metadata.headRef,
      baseRef: metadata.baseRef,
      filesChanged: metadata.filesChanged,
      additions: metadata.additions,
      deletions: metadata.deletions,
      repoFullName: metadata.repoFullName,
    },
    summary,
  };

  const userMessage = `Evaluate this pull request and return the typed risk assessment:\n\n${JSON.stringify(userPayload, null, 2)}`;

  // Rough guard: if the payload would exceed Jev input limit, truncate summary fields.
  const msgLen = userMessage.length;
  const estimatedTokens = Math.ceil(msgLen / 4);
  if (estimatedTokens > maxInputTokens) {
    // Truncate array fields to first 3 items
    const truncated = {
      ...userPayload,
      summary: {
        ...summary,
        behaviorChanged: summary.behaviorChanged.slice(0, 3),
        potentialImpact: summary.potentialImpact.slice(0, 3),
        reviewFocus: summary.reviewFocus.slice(0, 3),
        affectedFiles: summary.affectedFiles.slice(0, 5),
        affectedRoutes: summary.affectedRoutes.slice(0, 3),
        suspiciousSignals: summary.suspiciousSignals.slice(0, 3),
      },
    };
    return evaluateWithJev(
      truncated.summary as DeepSeekSummary,
      metadata,
      requestId
    );
  }

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
        max_tokens: 800,
        temperature: 0.1,
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

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new TriageError(
        ERROR_CODES.PROVIDER_FAILURE,
        `Jev provider returned HTTP ${res.status}: ${text.slice(0, 200)}`,
        502
      );
    }

    raw = (await res.json()) as OpenRouterResponse;
  } catch (err) {
    if (err instanceof TriageError) throw err;
    throw new TriageError(
      ERROR_CODES.PROVIDER_FAILURE,
      "Jev request failed.",
      502
    );
  }

  if (raw.error) {
    throw new TriageError(
      ERROR_CODES.PROVIDER_FAILURE,
      `Jev provider error: ${raw.error.message ?? "unknown"}`,
      502
    );
  }

  const content = raw.choices?.[0]?.message?.content;
  if (!content) {
    throw new TriageError(
      ERROR_CODES.INVALID_MODEL_OUTPUT,
      "Jev returned an empty response.",
      502
    );
  }

  let parsed: unknown;
  try {
    parsed = parseJevContent(content);
  } catch {
    throw new TriageError(
      ERROR_CODES.INVALID_MODEL_OUTPUT,
      "Jev returned non-JSON output.",
      502
    );
  }

  const result = JevEvaluationSchema.safeParse(parsed);
  if (!result.success) {
    throw new TriageError(
      ERROR_CODES.INVALID_MODEL_OUTPUT,
      `Jev response did not match the expected typed format: ${result.error.issues[0]?.path.join(".") || "response"} ${result.error.issues[0]?.message ?? "unknown"}`,
      502
    );
  }

  return { evaluation: result.data, usage: raw.usage };
}
