"use client";

import { Fragment, useState, useRef } from "react";
import type { TriageResult, TriageResponse } from "@/lib/types";

// ─── Scan states ──────────────────────────────────────────────────────────────
type ScanState =
  | { phase: "idle" }
  | { phase: "validating" }
  | { phase: "fetching" }
  | { phase: "summarizing" }
  | { phase: "evaluating" }
  | { phase: "complete"; result: TriageResult }
  | { phase: "error"; code: string; message: string };

const PHASE_LABELS: Record<string, string> = {
  validating: "Validating URL…",
  fetching: "Fetching PR from GitHub…",
  summarizing: "DeepSeek is summarizing…",
  evaluating: "Jev is evaluating…",
};

interface ScanPageProps {
  onResult: (result: TriageResult) => void;
}

export default function ScanPage({ onResult }: ScanPageProps) {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<ScanState>({ phase: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const isRunning =
    state.phase === "validating" ||
    state.phase === "fetching" ||
    state.phase === "summarizing" ||
    state.phase === "evaluating";

  async function handleScan(forceRerun = false) {
    if (isRunning) return;

    // Basic client-side URL validation
    const trimmed = url.trim();
    if (!trimmed) {
      setState({
        phase: "error",
        code: "INVALID_URL",
        message: "Please enter a GitHub PR URL.",
      });
      return;
    }

    const urlPattern =
      /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+$/;
    if (!urlPattern.test(trimmed)) {
      setState({
        phase: "error",
        code: "INVALID_URL",
        message:
          "URL must be https://github.com/{owner}/{repo}/pull/{number}",
      });
      return;
    }

    abortRef.current = new AbortController();

    setState({ phase: "validating" });
    await sleep(300);
    setState({ phase: "fetching" });
    await sleep(300);
    setState({ phase: "summarizing" });

    let data: TriageResponse;
    try {
      const res = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pullRequestUrl: trimmed, forceRerun }),
        signal: abortRef.current.signal,
      });
      data = (await res.json()) as TriageResponse;
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "AbortError") return;
      setState({
        phase: "error",
        code: "PROVIDER_FAILURE",
        message: "Network error. Please try again.",
      });
      return;
    }

    setState({ phase: "evaluating" });
    await sleep(200);

    if (data.error) {
      setState({
        phase: "error",
        code: data.error.code,
        message: data.error.message,
      });
      return;
    }

    setState({ phase: "complete", result: data.data });
    onResult(data.data);
  }

  const errorMessage = state.phase === "error" ? getErrorDisplay(state.code, state.message) : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-bg)",
        padding: "var(--space-6)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "var(--space-6)",
          width: "100%",
          maxWidth: "700px",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
            textAlign: "center",
          }}
        >
          <h1
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "34px",
              fontWeight: 600,
              lineHeight: "42px",
              color: "var(--color-text-primary)",
              margin: 0,
            }}
          >
            Scan a GitHub pull request
          </h1>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-base)",
              color: "var(--color-text-secondary)",
              lineHeight: "24px",
              margin: 0,
              maxWidth: "620px",
            }}
          >
            Paste a public GitHub PR link. Verdict summarizes the change with
            DeepSeek, scores risk with Jev, and tells you how much human
            attention it deserves.
          </p>
        </div>

        {/* Input area */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <label
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-xs)",
                fontWeight: 600,
                color: "var(--color-text-secondary)",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              GitHub Pull Request URL
            </label>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                color: "var(--color-text-muted)",
              }}
            >
              github.com/owner/repo/pull/123
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              background: "var(--color-bg)",
              border: `1px solid ${errorMessage ? "var(--color-danger-text)" : "var(--color-border)"}`,
              borderRadius: "8px",
              padding: "8px 8px 8px 16px",
              height: "52px",
            }}
          >
            <input
              type="text"
              inputMode="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (state.phase === "error") setState({ phase: "idle" });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isRunning) void handleScan();
              }}
              placeholder="https://github.com/org/repository/pull/1482"
              autoComplete="off"
              spellCheck={false}
              disabled={isRunning}
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-sm)",
                color: url ? "var(--color-text-primary)" : "var(--color-text-muted)",
                lineHeight: "20px",
              }}
            />
            <button
              onClick={() => void handleScan()}
              disabled={isRunning}
              style={{
                flexShrink: 0,
                height: "36px",
                width: "104px",
                background: isRunning ? "var(--color-text-secondary)" : "var(--color-text-primary)",
                color: "var(--color-bg)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                cursor: isRunning ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              {isRunning ? (
                <>
                  <Spinner />
                  <span style={{ fontSize: "11px" }}>Running…</span>
                </>
              ) : (
                "Scan PR"
              )}
            </button>
          </div>

          {/* Status / error line */}
          {isRunning && (
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-xs)",
                color: "var(--color-text-secondary)",
                margin: 0,
              }}
            >
              {PHASE_LABELS[state.phase] ?? "Processing…"}
            </p>
          )}
          {errorMessage && (
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-xs)",
                color: "var(--color-danger-text)",
                margin: 0,
              }}
            >
              {errorMessage}
            </p>
          )}
          {!isRunning && !errorMessage && (
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-xs)",
                color: "var(--color-text-muted)",
                margin: 0,
              }}
            >
              MergeCallibr only reads the selected pull request and its changed
              files. It does not modify or commit code.
            </p>
          )}
        </div>

        {/* Pipeline strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            background: "var(--color-panel)",
            borderRadius: "8px",
            padding: "16px 20px",
            width: "100%",
          }}
        >
          {[
            { num: "01", label: "DeepSeek summarizes" },
            { num: "02", label: "Jev evaluates" },
            { num: "03", label: "MergeCallibr recommends" },
          ].map((step, i) => (
            <Fragment key={step.num}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "3px",
                  flex: "1",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    color: "var(--color-text-muted)",
                    lineHeight: "14px",
                  }}
                >
                  {step.num}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "var(--text-sm)",
                    color: "var(--color-text-primary)",
                    lineHeight: "18px",
                  }}
                >
                  {step.label}
                </span>
              </div>
              {i < 2 && (
                <span
                  key={`arrow-${i}`}
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "14px",
                    flexShrink: 0,
                  }}
                >
                  →
                </span>
              )}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      style={{ animation: "spin 0.8s linear infinite" }}
    >
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <circle
        cx="6"
        cy="6"
        r="4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="14 8"
      />
    </svg>
  );
}

function getErrorDisplay(code: string, message: string): string {
  switch (code) {
    case "INVALID_URL":
      return message.includes("Must be") || message.includes("must be")
        ? "Needs a PR link — e.g. https://github.com/owner/repo/pull/123"
        : message;
    case "PUBLIC_REPOSITORY_REQUIRED":
      return "MergeCallibr only analyzes public GitHub repositories.";
    case "PR_NOT_FOUND":
      return message;
    case "GITHUB_RATE_LIMIT":
      return "GitHub API rate limit exceeded. Please try again in a moment.";
    case "RATE_LIMITED":
      return "Too many requests. Please wait a moment.";
    case "IN_FLIGHT":
      return "A scan is already running for this PR. Please wait.";
    case "OVERSIZED_PR":
      return "This PR is too large to analyze. It may still work with chunking — please try again.";
    case "PROVIDER_FAILURE":
      return "The AI provider is temporarily unavailable. Please try again.";
    case "INVALID_MODEL_OUTPUT":
      return "The model returned an unexpected response. Please try again.";
    default:
      return message || "An unexpected error occurred. Please try again.";
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
