import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { fetchOpenPullRequests, parseRepoUrl } from "@/lib/github";
import {
  ERROR_CODES,
  GitHubRepositoryUrlSchema,
  TriageError,
  type PullRequestListResponse,
} from "@/lib/types";

export const runtime = "nodejs";

function errorResponse(
  code: string,
  message: string,
  status: number,
  requestId: string
): NextResponse<PullRequestListResponse> {
  return NextResponse.json(
    { data: null, error: { code, message } },
    { status, headers: { "X-Request-Id": requestId } }
  );
}

export async function POST(
  req: NextRequest
): Promise<NextResponse<PullRequestListResponse>> {
  const requestId = crypto.randomUUID();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(ERROR_CODES.INVALID_URL, "Request body is not valid JSON.", 400, requestId);
  }

  const url = (body as { repositoryUrl?: unknown })?.repositoryUrl;
  const parsedUrl = GitHubRepositoryUrlSchema.safeParse(url);
  if (!parsedUrl.success) {
    return errorResponse(
      ERROR_CODES.INVALID_URL,
      "URL must be https://github.com/{owner}/{repo}",
      400,
      requestId
    );
  }

  try {
    const data = await fetchOpenPullRequests(parseRepoUrl(parsedUrl.data));
    return NextResponse.json(
      { data, error: null },
      { headers: { "X-Request-Id": requestId } }
    );
  } catch (err) {
    if (err instanceof TriageError) {
      return errorResponse(err.code, err.message, err.statusCode, requestId);
    }
    return errorResponse(ERROR_CODES.INTERNAL_ERROR, "An unexpected error occurred.", 500, requestId);
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { data: null, error: { code: ERROR_CODES.METHOD_NOT_ALLOWED, message: "Use POST." } },
    { status: 405 }
  );
}