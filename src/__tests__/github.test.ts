import { describe, it, expect } from "vitest";
import { parsePrUrl, parseRepoUrl } from "@/lib/github";
import { TriageError } from "@/lib/types";

describe("parsePrUrl", () => {
  it("parses a valid PR URL", () => {
    const result = parsePrUrl("https://github.com/org/repo/pull/123");
    expect(result).toEqual({ owner: "org", repo: "repo", number: 123 });
  });

  it("rejects a non-GitHub URL", () => {
    expect(() => parsePrUrl("https://gitlab.com/org/repo/pull/123")).toThrow(
      TriageError
    );
  });

  it("rejects an issue URL", () => {
    expect(() =>
      parsePrUrl("https://github.com/org/repo/issues/123")
    ).toThrow(TriageError);
  });

  it("rejects a commit URL", () => {
    expect(() =>
      parsePrUrl("https://github.com/org/repo/commit/abc123")
    ).toThrow(TriageError);
  });

  it("rejects a malformed URL with no PR number", () => {
    expect(() => parsePrUrl("https://github.com/org/repo/pull/")).toThrow(
      TriageError
    );
  });

  it("rejects an empty string", () => {
    expect(() => parsePrUrl("")).toThrow(TriageError);
  });

  it("rejects a URL with 0 as PR number", () => {
    expect(() => parsePrUrl("https://github.com/org/repo/pull/0")).toThrow(
      TriageError
    );
  });

  it("handles repos with hyphens and dots", () => {
    const result = parsePrUrl(
      "https://github.com/my-org/my-repo.js/pull/99"
    );
    expect(result).toEqual({ owner: "my-org", repo: "my-repo.js", number: 99 });
  });
});

describe("parseRepoUrl", () => {
  it("parses a valid repository URL", () => {
    expect(parseRepoUrl("https://github.com/org/repo")).toEqual({
      owner: "org",
      repo: "repo",
    });
  });

  it("rejects a pull request URL", () => {
    expect(() => parseRepoUrl("https://github.com/org/repo/pull/123")).toThrow(
      TriageError
    );
  });
});
