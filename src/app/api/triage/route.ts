import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabase } from "@/lib/supabase";
import { parsePrUrl, fetchPR } from "@/lib/github";
import { prepareDiff } from "@/lib/diff";
import { summarizeWithDeepSeek, summarizeChunked } from "@/lib/deepseek";
import { evaluateWithJev } from "@/lib/jev";
import { computeDecision } from "@/lib/router";
import {
  buildScanKey,
  getCachedResult,
  bustCache,
  getInFlight,
  registerInFlight,
  checkRateLimit,
} from "@/lib/dedup";
import {
  TriageRequestSchema,
  ERROR_CODES,
  TriageError,
  type TriageResult,
  type TriageResponse,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120; // seconds

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function errResponse(
  code: string,
  message: string,
  status: number,
  requestId: string
): NextResponse<TriageResponse> {
  return NextResponse.json(
    { data: null, error: { code, message } },
    { status, headers: { "X-Request-Id": requestId } }
  );
}

export async function POST(req: NextRequest): Promise<NextResponse<TriageResponse>> {
  const requestId = crypto.randomUUID();
  const startMs = Date.now();

  // Rate limiting
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return errResponse(
      ERROR_CODES.RATE_LIMITED,
      "Too many requests. Please slow down.",
      429,
      requestId
    );
  }

  // Parse + validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errResponse(ERROR_CODES.INVALID_URL, "Request body is not valid JSON.", 400, requestId);
  }

  const parsed = TriageRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errResponse(
      ERROR_CODES.INVALID_URL,
      parsed.error.issues[0]?.message ?? "Invalid request.",
      400,
      requestId
    );
  }

  const { pullRequestUrl, forceRerun } = parsed.data;

  // Parse URL
  let prRef: ReturnType<typeof parsePrUrl>;
  try {
    prRef = parsePrUrl(pullRequestUrl);
  } catch (err) {
    if (err instanceof TriageError) {
      return errResponse(err.code, err.message, err.statusCode, requestId);
    }
    return errResponse(ERROR_CODES.INVALID_URL, "Invalid PR URL.", 400, requestId);
  }

  // We need headSha for the scan key, but we don't have it yet.
  // We'll use a pre-fetch-key for dedup lookups after we have the SHA.
  // Strategy: fetch PR metadata first (lightweight), then check cache.

  async function runFullTriage(): Promise<TriageResult> {
    // Fetch PR + files
    const { metadata, files } = await fetchPR(prRef);
    const scanKey = buildScanKey(prRef.owner, prRef.repo, prRef.number, metadata.headSha);

    // Check completed cache (unless force rerun)
    if (!forceRerun) {
      const cached = getCachedResult(scanKey);
      if (cached) {
        return { ...cached, requestId };
      }
    } else {
      bustCache(scanKey);
    }

    // Check in-flight
    const inFlightResult = getInFlight(scanKey);
    if (inFlightResult && !forceRerun) {
      return inFlightResult;
    }

    return registerInFlight(scanKey, async () => {
      const limitations: string[] = [];

      // Prepare diff
      const chunks = prepareDiff(files, metadata.title, metadata.number);
      if (chunks.length === 0) {
        limitations.push("No reviewable files found in this PR.");
      }

      // Summarize
      let summary;
      let deepseekUsage;
      const tokenUsage: TriageResult["tokenUsage"] = {};

      if (chunks.length === 0) {
        // Empty diff fallback
        const { summary: s, usage } = await summarizeWithDeepSeek(
          `PR #${metadata.number}: ${metadata.title}\n\n(No reviewable file patches available.)`,
          requestId
        );
        summary = s;
        deepseekUsage = usage;
      } else if (chunks.length === 1 && !chunks[0].wasChunked) {
        const { summary: s, usage } = await summarizeWithDeepSeek(
          chunks[0].content,
          requestId
        );
        summary = s;
        deepseekUsage = usage;
      } else {
        // Oversized PR
        const { summary: s, limitations: chunkLimitations } = await summarizeChunked(
          chunks.map((c) => c.content),
          requestId
        );
        summary = s;
        limitations.push(...chunkLimitations);
      }

      if (deepseekUsage) {
        tokenUsage.deepseekPrompt = deepseekUsage.prompt_tokens;
        tokenUsage.deepseekCompletion = deepseekUsage.completion_tokens;
      }

      // Evaluate
      const { evaluation, usage: jevUsage } = await evaluateWithJev(
        summary,
        metadata,
        requestId
      );
      if (jevUsage) {
        tokenUsage.jevPrompt = jevUsage.prompt_tokens;
        tokenUsage.jevCompletion = jevUsage.completion_tokens;
      }

      // Route
      const decision = computeDecision(evaluation, limitations);
      const scanKey2 = buildScanKey(prRef.owner, prRef.repo, prRef.number, metadata.headSha);

      const result: TriageResult = {
        decision,
        pullRequest: metadata,
        summary,
        evaluation,
        limitations,
        scanKey: scanKey2,
        requestId,
        durationMs: Date.now() - startMs,
        tokenUsage,
      };

      // Persist to Supabase — fire-and-forget, never blocks the response.
      supabase
        .from("triage_results")
        .upsert({ scan_key: scanKey2, result, updated_at: new Date().toISOString() })
        .then(({ error }) => { if (error) console.warn("[supabase] upsert failed:", error.message); });

      return result;
    });
  }

  try {
    const result = await runFullTriage();
    return NextResponse.json(
      { data: result, error: null },
      { headers: { "X-Request-Id": requestId } }
    );
  } catch (err) {
    if (err instanceof TriageError) {
      return errResponse(err.code, err.message, err.statusCode, requestId);
    }
    console.error("[triage] unhandled error", err);
    return errResponse(
      ERROR_CODES.INTERNAL_ERROR,
      "An unexpected error occurred.",
      500,
      requestId
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { data: null, error: { code: ERROR_CODES.METHOD_NOT_ALLOWED, message: "Use POST." } },
    { status: 405 }
  );
}
