import crypto from "node:crypto";
import type { TriageResult } from "./types";

// ─── Scan key ─────────────────────────────────────────────────────────────────

// Increment when prompts or schemas change.
const PROMPT_VERSION = "v1";

export function buildScanKey(
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string
): string {
  // Read at call-time so the key reflects whatever model is active in env at request time.
  const deepseekModel = process.env.DEEPSEEK_MODEL ?? "deepseek/deepseek-v4.1-flash";
  const jevModel = process.env.JEV_MODEL ?? "typesafe/jev-router";
  const raw = [
    `${owner}/${repo}`,
    String(prNumber),
    headSha,
    deepseekModel,
    jevModel,
    PROMPT_VERSION,
  ].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

// ─── In-flight deduplication ──────────────────────────────────────────────────

type Waiter = {
  resolve: (result: TriageResult) => void;
  reject: (err: unknown) => void;
};

// Map of scanKey → pending promise + waiters
const inFlight = new Map<
  string,
  { promise: Promise<TriageResult>; waiters: Waiter[] }
>();

export function getInFlight(scanKey: string): Promise<TriageResult> | null {
  const entry = inFlight.get(scanKey);
  if (!entry) return null;

  // Return a new promise that resolves/rejects when the in-flight request settles
  return new Promise<TriageResult>((resolve, reject) => {
    entry.waiters.push({ resolve, reject });
  });
}

export function registerInFlight(
  scanKey: string,
  work: () => Promise<TriageResult>
): Promise<TriageResult> {
  const waiters: Waiter[] = [];

  const promise = work().then(
    (result) => {
      inFlight.delete(scanKey);
      waiters.forEach((w) => w.resolve(result));
      // Cache completed result
      completedCache.set(scanKey, { result, at: Date.now() });
      return result;
    },
    (err) => {
      inFlight.delete(scanKey);
      waiters.forEach((w) => w.reject(err));
      throw err;
    }
  );

  inFlight.set(scanKey, { promise, waiters });
  return promise;
}

// ─── Completed result cache ───────────────────────────────────────────────────

// Simple in-process LRU-like map. Safe for single-instance / serverless cold starts.
// Per BUILD_INSTRUCTIONS: if durable cross-instance cache is unavailable, this is acceptable.
const completedCache = new Map<string, { result: TriageResult; at: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function getCachedResult(scanKey: string): TriageResult | null {
  const entry = completedCache.get(scanKey);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    completedCache.delete(scanKey);
    return null;
  }
  return entry.result;
}

export function bustCache(scanKey: string): void {
  completedCache.delete(scanKey);
}

// ─── Per-IP rate limiting ─────────────────────────────────────────────────────

const ipWindows = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10; // requests per window

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipWindows.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipWindows.set(ip, { count: 1, windowStart: now });
    return true; // OK
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false; // rate limited
  }

  entry.count++;
  return true; // OK
}
