import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildScanKey,
  checkRateLimit,
  getCachedResult,
  bustCache,
} from "@/lib/dedup";
import type { TriageResult } from "@/lib/types";

describe("buildScanKey", () => {
  it("produces the same key for identical inputs", () => {
    const a = buildScanKey("org", "repo", 1, "abc123");
    const b = buildScanKey("org", "repo", 1, "abc123");
    expect(a).toBe(b);
  });

  it("produces different keys when headSha differs", () => {
    const a = buildScanKey("org", "repo", 1, "sha1");
    const b = buildScanKey("org", "repo", 1, "sha2");
    expect(a).not.toBe(b);
  });

  it("produces different keys when PR number differs", () => {
    const a = buildScanKey("org", "repo", 1, "sha");
    const b = buildScanKey("org", "repo", 2, "sha");
    expect(a).not.toBe(b);
  });

  it("returns a 32-char hex string", () => {
    const key = buildScanKey("org", "repo", 42, "sha");
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("checkRateLimit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows initial requests up to the limit", () => {
    const ip = `test-ip-${Date.now()}`;
    // Should allow at least one request
    expect(checkRateLimit(ip)).toBe(true);
  });

  it("blocks requests beyond the per-window limit", () => {
    const ip = `burst-ip-${Date.now()}`;
    let allowed = 0;
    for (let i = 0; i < 20; i++) {
      if (checkRateLimit(ip)) allowed++;
    }
    // Should allow exactly 10, block the rest
    expect(allowed).toBe(10);
  });
});

describe("cache", () => {
  it("returns null for unknown scan key", () => {
    expect(getCachedResult("unknown-key")).toBeNull();
  });

  it("returns null after busting", () => {
    const scanKey = "test-scan-key-bust";
    bustCache(scanKey);
    expect(getCachedResult(scanKey)).toBeNull();
  });
});
