import { describe, it, expect } from "vitest";
import { prepareDiff } from "@/lib/diff";
import type { ChangedFile } from "@/lib/types";

describe("prepareDiff", () => {
  const makeFile = (filename: string, patch?: string): ChangedFile => ({
    filename,
    status: "modified",
    additions: 10,
    deletions: 2,
    patch: patch ?? "- old\n+ new",
  });

  it("includes source files", () => {
    const files = [makeFile("src/auth/session.ts")];
    const [chunk] = prepareDiff(files, "Test PR", 1);
    expect(chunk.content).toContain("src/auth/session.ts");
    expect(chunk.wasChunked).toBe(false);
  });

  it("excludes lock files", () => {
    const files = [makeFile("package-lock.json"), makeFile("src/index.ts")];
    const [chunk] = prepareDiff(files, "Test PR", 1);
    expect(chunk.excludedFiles).toContain("package-lock.json");
    expect(chunk.includedFiles).toContain("src/index.ts");
  });

  it("excludes binary/image files", () => {
    const files = [makeFile("public/logo.png"), makeFile("src/utils.ts")];
    const [chunk] = prepareDiff(files, "Test PR", 1);
    expect(chunk.excludedFiles).toContain("public/logo.png");
  });

  it("excludes minified assets", () => {
    const files = [makeFile("dist/bundle.min.js"), makeFile("src/app.ts")];
    const [chunk] = prepareDiff(files, "Test PR", 1);
    expect(chunk.excludedFiles).toContain("dist/bundle.min.js");
  });

  it("chunks oversized PRs", () => {
    // Each file ~2250 tokens (9000 chars / 4). With CHUNK_SIZE=9000 and 5 files,
    // each file exceeds one chunk on its own, forcing chunking.
    const bigPatch = "x".repeat(36_000); // ~9000 tokens per file
    const files = Array.from({ length: 3 }, (_, i) =>
      makeFile(`src/file${i}.ts`, bigPatch)
    );
    const chunks = prepareDiff(files, "Oversized PR", 1);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].wasChunked).toBe(true);
    chunks.forEach((c, i) => {
      expect(c.chunkIndex).toBe(i);
      expect(c.totalChunks).toBe(chunks.length);
    });
  });

  it("does not chunk a PR under the token limit", () => {
    const files = [makeFile("src/small.ts", "- a\n+ b")];
    const chunks = prepareDiff(files, "Small PR", 1);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].wasChunked).toBe(false);
  });
});
