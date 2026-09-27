import { Octokit } from "@octokit/rest";
import {
  type ChangedFile,
  type GitHubRepo,
  type PRMetadata,
  ERROR_CODES,
  TriageError,
} from "./types";

function getOctokit(): Octokit {
  // Read at call-time — never cached at module level so the key is never in scope
  // outside of server-side execution.
  const token = process.env.GITHUB_API_TOKEN;
  return new Octokit({
    auth: token || undefined,
    request: { timeout: 15000 },
  });
}

/**
 * Parse a GitHub PR URL into owner/repo/number.
 * Accepts only: https://github.com/{owner}/{repo}/pull/{number}
 */
export function parsePrUrl(url: string): GitHubRepo {
  const match = url.match(
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)$/
  );
  if (!match) {
    throw new TriageError(
      ERROR_CODES.INVALID_URL,
      "URL must be https://github.com/{owner}/{repo}/pull/{number}",
      400
    );
  }
  const [, owner, repo, numberStr] = match;
  const number = parseInt(numberStr, 10);
  if (!Number.isFinite(number) || number < 1) {
    throw new TriageError(ERROR_CODES.INVALID_URL, "Invalid PR number", 400);
  }
  return { owner, repo, number };
}

/**
 * Verify the repository is public (private: false) via GET /repos/{owner}/{repo}.
 * A 404 is NOT treated as proof of public — we stop with PUBLIC_REPOSITORY_REQUIRED.
 * Only when the API explicitly says private: false do we proceed.
 */
async function assertPublicRepo(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<void> {
  let repoData: { private?: boolean } | undefined;
  try {
    const { data } = await octokit.repos.get({ owner, repo });
    repoData = data;
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 403 || status === 404) {
      throw new TriageError(
        ERROR_CODES.PUBLIC_REPOSITORY_REQUIRED,
        "MergeCallibr only analyzes public GitHub repositories.",
        403
      );
    }
    if (status === 429) {
      throw new TriageError(
        ERROR_CODES.GITHUB_RATE_LIMIT,
        "GitHub API rate limit exceeded. Please try again later.",
        429
      );
    }
    throw new TriageError(
      ERROR_CODES.PUBLIC_REPOSITORY_REQUIRED,
      "MergeCallibr only analyzes public GitHub repositories.",
      403
    );
  }

  // Must explicitly be false — any other value (including undefined) is not safe.
  if (repoData?.private !== false) {
    throw new TriageError(
      ERROR_CODES.PUBLIC_REPOSITORY_REQUIRED,
      "MergeCallibr only analyzes public GitHub repositories.",
      403
    );
  }
}

/** Fetch PR metadata and changed files from GitHub. */
export async function fetchPR(ref: GitHubRepo): Promise<{
  metadata: PRMetadata;
  files: ChangedFile[];
}> {
  const octokit = getOctokit();
  const { owner, repo, number } = ref;

  // 1. Verify public repo first.
  await assertPublicRepo(octokit, owner, repo);

  // 2. Fetch PR details.
  let prData: Awaited<ReturnType<typeof octokit.pulls.get>>["data"];
  try {
    const { data } = await octokit.pulls.get({ owner, repo, pull_number: number });
    prData = data;
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 404) {
      throw new TriageError(
        ERROR_CODES.PR_NOT_FOUND,
        `PR #${number} was not found in ${owner}/${repo}.`,
        404
      );
    }
    if (status === 429) {
      throw new TriageError(
        ERROR_CODES.GITHUB_RATE_LIMIT,
        "GitHub API rate limit exceeded. Please try again later.",
        429
      );
    }
    throw new TriageError(
      ERROR_CODES.INTERNAL_ERROR,
      "Failed to fetch PR from GitHub.",
      500
    );
  }

  // 3. Fetch changed files (up to 300; paginated).
  let rawFiles: ChangedFile[] = [];
  try {
    const allFiles = await octokit.paginate(octokit.pulls.listFiles, {
      owner,
      repo,
      pull_number: number,
      per_page: 100,
    });
    rawFiles = allFiles.map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
    }));
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 429) {
      throw new TriageError(
        ERROR_CODES.GITHUB_RATE_LIMIT,
        "GitHub API rate limit exceeded. Please try again later.",
        429
      );
    }
    throw new TriageError(
      ERROR_CODES.DIFF_UNAVAILABLE,
      "Could not retrieve PR files from GitHub.",
      502
    );
  }

  const metadata: PRMetadata = {
    title: prData.title,
    number: prData.number,
    author: prData.user?.login ?? "unknown",
    headRef: prData.head.ref,
    baseRef: prData.base.ref,
    headSha: prData.head.sha,
    state: prData.state,
    htmlUrl: prData.html_url,
    filesChanged: prData.changed_files,
    additions: prData.additions,
    deletions: prData.deletions,
    repoFullName: prData.base.repo.full_name,
    createdAt: prData.created_at,
    updatedAt: prData.updated_at,
  };

  return { metadata, files: rawFiles };
}
