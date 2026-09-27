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
    maxOutputTokens: parseInt(process.env.MAX_SUMMARY_OUTPUT_TOKENS ?? "4000", 10),
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
- Do NOT wrap the JSON in a markdown code fence or include any explanation outside the JSON object.
- All array values must be non-empty strings.
- If a category has no items, return an empty array [].`;


interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

interface OpenRouterResponse {
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | null; reasoning?: string };
  }>;
  usage?: OpenRouterUsage;
  error?: { message?: string; code?: number };
}

function parseJsonContent(content: string): unknown {
  const normalized = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  try {
    return JSON.parse(normalized);
  } catch {
    for (let start = normalized.indexOf("{"); start >= 0; start = normalized.indexOf("{", start + 1)) {
      let depth = 0;
      let inString = false;
      let escaped = false;

      for (let index = start; index < normalized.length; index++) {
        const character = normalized[index];
        if (inString) {
          if (escaped) escaped = false;
          else if (character === "\\") escaped = true;
          else if (character === '"') inString = false;
          continue;
        }
        if (character === '"') {
          inString = true;
        } else if (character === "{") {
          depth++;
        } else if (character === "}" && --depth === 0) {
          try {
            return JSON.parse(normalized.slice(start, index + 1));
          } catch {
            break;
          }
        }
      }
    }
    throw new Error("No JSON object found");
  }
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
        // NOTE: deepseek-v4.1-flash is a reasoning model and does NOT support
        // json_schema response_format — it returns 400. The system prompt enforces
        // raw JSON output instead, and parseJsonContent handles extraction.
      }),
      signal: AbortSignal.timeout(90_000),
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
        `DeepSeek provider returned HTTP ${res.status}: ${text.slice(0, 200)}`,
        502
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

  const choice = raw.choices?.[0];

  // DeepSeek v4.1-flash is a reasoning model — it spends tokens on internal
  // reasoning before producing content. If the output was cut off, raise the
  // limit (MAX_SUMMARY_OUTPUT_TOKENS env var, default 4000).
  if (choice?.finish_reason === "length") {
    throw new TriageError(
      ERROR_CODES.INVALID_MODEL_OUTPUT,
      "DeepSeek output was truncated (hit token limit). Increase MAX_SUMMARY_OUTPUT_TOKENS.",
      502
    );
  }

  const content = choice?.message?.content;
  if (!content) {
    throw new TriageError(
      ERROR_CODES.INVALID_MODEL_OUTPUT,
      "DeepSeek returned an empty response.",
      502
    );
  }

  let parsed: unknown;
  try {
    parsed = parseJsonContent(content);
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
      `DeepSeek response did not match the expected summary format: ${result.error.issues[0]?.path.join(".") || "response"} ${result.error.issues[0]?.message ?? "unknown"}`,
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
