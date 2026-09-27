import type { ChangedFile } from "./types";

// Token estimation: ~4 chars per token (rough GPT-3/4 heuristic)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Filenames/patterns to exclude from diff context. */
const EXCLUDE_PATTERNS: RegExp[] = [
  // Lock files
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /Gemfile\.lock$/,
  /Cargo\.lock$/,
  /poetry\.lock$/,
  // Build output / generated
  /\.min\.(js|css)$/,
  /\.map$/,
  /dist\//,
  /build\//,
  /out\//,
  /\.next\//,
  /__pycache__\//,
  /coverage\//,
  // Vendored deps
  /vendor\//,
  /node_modules\//,
  // Binary / media
  /\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|otf|pdf|zip|tar|gz|bin|exe)$/i,
  // Snapshots
  /\.snap$/,
  // Large generated files
  /openapi\.json$/,
  /swagger\.json$/,
];

function shouldIncludeFile(filename: string): boolean {
  return !EXCLUDE_PATTERNS.some((re) => re.test(filename));
}

export interface PreparedDiff {
  content: string;
  estimatedTokens: number;
  includedFiles: string[];
  excludedFiles: string[];
  wasChunked: boolean;
  chunkIndex?: number;
  totalChunks?: number;
}

const MAX_DIFF_TOKENS = parseInt(
  process.env.MAX_DIFF_INPUT_TOKENS ?? "18000",
  10
);
const CHUNK_SIZE = 9000; // tokens per chunk

export function prepareDiff(
  files: ChangedFile[],
  prTitle: string,
  prNumber: number
): PreparedDiff[] {
  const includedFiles: string[] = [];
  const excludedFiles: string[] = [];

  // Filter and build file blocks
  const blocks: string[] = [];
  let total = 0;

  for (const file of files) {
    if (!shouldIncludeFile(file.filename)) {
      excludedFiles.push(file.filename);
      continue;
    }
    includedFiles.push(file.filename);
    const patch = file.patch ?? "(binary or unavailable)";
    const block = `--- ${file.filename} (+${file.additions} -${file.deletions})\n${patch}`;
    blocks.push(block);
    total += estimateTokens(block);
  }

  const header = `PR #${prNumber}: ${prTitle}\n\n`;
  const headerTokens = estimateTokens(header);

  const fullContent = header + blocks.join("\n\n");
  const fullTokens = headerTokens + total;

  // Fits within limit — no chunking needed
  if (fullTokens <= MAX_DIFF_TOKENS) {
    return [
      {
        content: fullContent,
        estimatedTokens: fullTokens,
        includedFiles,
        excludedFiles,
        wasChunked: false,
      },
    ];
  }

  // Oversized — split into chunks
  const chunks: PreparedDiff[] = [];
  let currentBlocks: string[] = [];
  let currentTokens = headerTokens;

  for (const block of blocks) {
    const bt = estimateTokens(block);
    if (currentTokens + bt > CHUNK_SIZE && currentBlocks.length > 0) {
      chunks.push({
        content: header + currentBlocks.join("\n\n"),
        estimatedTokens: currentTokens,
        includedFiles,
        excludedFiles,
        wasChunked: true,
        chunkIndex: chunks.length,
        totalChunks: -1, // filled below
      });
      currentBlocks = [];
      currentTokens = headerTokens;
    }
    currentBlocks.push(block);
    currentTokens += bt;
  }

  if (currentBlocks.length > 0) {
    chunks.push({
      content: header + currentBlocks.join("\n\n"),
      estimatedTokens: currentTokens,
      includedFiles,
      excludedFiles,
      wasChunked: true,
      chunkIndex: chunks.length,
      totalChunks: -1,
    });
  }

  // Fill totalChunks
  const n = chunks.length;
  return chunks.map((c, i) => ({ ...c, chunkIndex: i, totalChunks: n }));
}
