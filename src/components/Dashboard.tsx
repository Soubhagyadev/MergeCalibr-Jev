"use client";

import { useState } from "react";
import type { TriageResult, TriageDecision } from "@/lib/types";

// ─── Decision badge ───────────────────────────────────────────────────────────
function DecisionBadge({
  decision,
  size = "sm",
}: {
  decision: TriageDecision;
  size?: "sm" | "lg";
}) {
  const config = {
    ESCALATED: {
      label: "Escalated",
      bg: "var(--color-danger-bg)",
      color: "var(--color-danger-text)",
      symbol: "●",
    },
    NEEDS_REVIEW: {
      label: "Needs review",
      bg: "var(--color-warning-bg)",
      color: "var(--color-warning-text)",
      symbol: "⚠",
    },
    LOW_RISK: {
      label: "Low risk",
      bg: "var(--color-success-bg)",
      color: "var(--color-success-text)",
      symbol: "✓",
    },
  }[decision];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        background: config.bg,
        color: config.color,
        borderRadius: "var(--radius-sm)",
        padding: size === "lg" ? "4px 10px" : "2px 8px",
        fontFamily: "var(--font-sans)",
        fontSize: size === "lg" ? "var(--text-sm)" : "var(--text-xs)",
        fontWeight: 500,
        lineHeight: "16px",
      }}
      aria-label={config.label}
    >
      <span aria-hidden>{config.symbol}</span>
      {config.label}
    </span>
  );
}

// ─── Left pane ───────────────────────────────────────────────────────────────

interface LeftPaneProps {
  results: TriageResult[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
  filter: "all" | "ESCALATED" | "NEEDS_REVIEW" | "LOW_RISK";
  onFilter: (f: "all" | "ESCALATED" | "NEEDS_REVIEW" | "LOW_RISK") => void;
}

function LeftPane({
  results,
  selectedIdx,
  onSelect,
  filter,
  onFilter,
}: LeftPaneProps) {
  const filters: Array<{
    key: "all" | "ESCALATED" | "NEEDS_REVIEW" | "LOW_RISK";
    label: string;
  }> = [
    { key: "all", label: "All" },
    { key: "ESCALATED", label: "Escalated" },
    { key: "NEEDS_REVIEW", label: "Needs review" },
    { key: "LOW_RISK", label: "Approved" },
  ];

  const visible =
    filter === "all"
      ? results
      : results.filter((r) => r.decision === filter);

  return (
    <div
      style={{
        background: "var(--color-panel)",
        borderRight: "1px solid var(--color-border)",
        flexShrink: 0,
        width: "480px",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-1)",
          paddingBottom: "var(--space-4)",
          paddingInline: "var(--space-5)",
          paddingTop: "var(--space-5)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-lg)",
              fontWeight: 600,
              color: "var(--color-text-primary)",
            }}
          >
            MergeCallibr
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-xs)",
              color: "var(--color-text-muted)",
              background: "var(--color-bg)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              padding: "2px 6px",
            }}
          >
            v0.4
          </span>
        </div>
        {results[0] && (
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              color: "var(--color-text-secondary)",
            }}
          >
            {results[0].pullRequest.repoFullName}
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          paddingBottom: "var(--space-4)",
          paddingInline: "var(--space-5)",
        }}
      >
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => onFilter(f.key)}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "6px 10px",
              borderRadius: "var(--radius-sm)",
              background: filter === f.key ? "var(--color-text-primary)" : "transparent",
              color:
                filter === f.key
                  ? "var(--color-bg)"
                  : "var(--color-text-secondary)",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              fontWeight: filter === f.key ? 500 : 400,
              border: "none",
              cursor: "pointer",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* PR list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {visible.length === 0 ? (
          <div
            style={{
              padding: "var(--space-6) var(--space-5)",
              color: "var(--color-text-muted)",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
            }}
          >
            No pull requests for this filter.
          </div>
        ) : (
          visible.map((r, i) => {
            const realIdx = results.indexOf(r);
            const selected = realIdx === selectedIdx;
            return (
              <button
                key={r.scanKey}
                onClick={() => onSelect(realIdx)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  padding: "var(--space-4) var(--space-5)",
                  width: "100%",
                  textAlign: "left",
                  background: selected ? "var(--color-bg)" : "transparent",
                  borderLeft: selected
                    ? "2px solid var(--color-text-primary)"
                    : "2px solid transparent",
                  borderTop: "1px solid var(--color-border)",
                  borderBottom: i === visible.length - 1 ? "1px solid var(--color-border)" : "none",
                  borderRight: "none",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "var(--text-base)",
                    fontWeight: 500,
                    color: "var(--color-text-primary)",
                    lineHeight: "18px",
                  }}
                >
                  {r.pullRequest.title}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--text-xs)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    #{r.pullRequest.number}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: "var(--text-xs)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {r.pullRequest.author} → {r.pullRequest.baseRef}
                  </span>
                </div>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <DecisionBadge decision={r.decision} />
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--text-xs)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    risk {r.evaluation.riskScore.toFixed(2)}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Risk bar item ────────────────────────────────────────────────────────────
function RiskBar({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  let bg = "var(--color-panel)";
  let scoreColor = "var(--color-text-secondary)";
  if (value >= 0.7) {
    bg = "var(--color-danger-bg)";
    scoreColor = "var(--color-danger-text)";
  } else if (value >= 0.4) {
    bg = "var(--color-warning-bg)";
    scoreColor = "var(--color-warning-text)";
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: bg,
        borderRadius: "4px",
        padding: "7px 10px",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-sm)",
          color: "var(--color-text-primary)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-xs)",
          color: scoreColor,
        }}
      >
        {value.toFixed(2)}
      </span>
    </div>
  );
}

// ─── Right pane ───────────────────────────────────────────────────────────────

interface RightPaneProps {
  result: TriageResult;
  onRerun: () => void;
}

function RightPane({ result, onRerun }: RightPaneProps) {
  const { decision, pullRequest, summary, evaluation } = result;

  const verdictConfig = {
    ESCALATED: {
      riskLabel: "HIGH RISK",
      action: "HUMAN REVIEW REQUIRED",
      riskColor: "var(--color-danger-text)",
      bg: "var(--color-danger-bg)",
      border: "#f2b8b5",
    },
    NEEDS_REVIEW: {
      riskLabel: "MEDIUM RISK",
      action: "REVIEW RECOMMENDED",
      riskColor: "var(--color-warning-text)",
      bg: "var(--color-warning-bg)",
      border: "#f5d6a8",
    },
    LOW_RISK: {
      riskLabel: "LOW RISK",
      action: "LIKELY SAFE TO MERGE",
      riskColor: "var(--color-success-text)",
      bg: "var(--color-success-bg)",
      border: "#a8d5b5",
    },
  }[decision];

  return (
    <div
      style={{
        flex: 1,
        height: "100vh",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        background: "var(--color-bg)",
      }}
    >
      {/* PR header */}
      <div
        style={{
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          padding: "var(--space-5) var(--space-6) var(--space-4)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-xl)",
              fontWeight: 600,
              color: "var(--color-text-primary)",
              lineHeight: "28px",
              margin: 0,
              flex: 1,
              paddingRight: "var(--space-4)",
            }}
          >
            {pullRequest.title}
          </h2>
          <DecisionBadge decision={decision} size="lg" />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-sm)",
              color: "var(--color-text-muted)",
            }}
          >
            #{pullRequest.number}
          </span>
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              color: "var(--color-text-secondary)",
            }}
          >
            {pullRequest.author} → {pullRequest.baseRef}
          </span>
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              color: "var(--color-text-muted)",
            }}
          >
            {pullRequest.filesChanged} file{pullRequest.filesChanged !== 1 ? "s" : ""} changed
          </span>
        </div>
      </div>

      {/* Pipeline strip */}
      <div
        style={{
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px var(--space-6)",
        }}
      >
        {[
          { label: "Summarized", active: false },
          { label: "→", active: false, arrow: true },
          { label: "Scored by Jev", active: false },
          { label: "→", active: false, arrow: true },
          {
            label: decision === "ESCALATED" ? "Escalated" : decision === "LOW_RISK" ? "Low risk" : "Needs review",
            active: true,
          },
        ].map((item, i) => (
          <span
            key={i}
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-xs)",
              fontWeight: item.active ? 600 : 500,
              color: item.active
                ? decision === "ESCALATED"
                  ? "var(--color-danger-text)"
                  : decision === "LOW_RISK"
                  ? "var(--color-success-text)"
                  : "var(--color-warning-text)"
                : item.arrow
                ? "var(--color-text-muted)"
                : "var(--color-text-secondary)",
            }}
          >
            {item.label}
          </span>
        ))}
      </div>

      {/* Scrollable content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          padding: "18px var(--space-6) var(--space-5)",
        }}
      >
        {/* 1. Jev Verdict card */}
        <div
          style={{
            background: verdictConfig.bg,
            border: `1px solid ${verdictConfig.border}`,
            borderRadius: "8px",
            padding: "18px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "1px",
              color: verdictConfig.riskColor,
            }}
          >
            JEV VERDICT
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: "36px",
            }}
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: "2px" }}
            >
              <span
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "11px",
                  color: verdictConfig.riskColor,
                  opacity: 0.7,
                }}
              >
                {verdictConfig.riskLabel}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "26px",
                  lineHeight: "30px",
                  color: verdictConfig.riskColor,
                }}
              >
                {evaluation.riskScore.toFixed(2)}
              </span>
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "2px" }}
            >
              <span
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "11px",
                  color: verdictConfig.riskColor,
                  opacity: 0.7,
                }}
              >
                CONFIDENCE
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "26px",
                  lineHeight: "30px",
                  color: "var(--color-text-primary)",
                }}
              >
                {Math.round(evaluation.confidence * 100)}%
              </span>
            </div>
          </div>
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "20px",
              fontWeight: 600,
              color: verdictConfig.riskColor,
              lineHeight: "26px",
            }}
          >
            {verdictConfig.action}
          </div>
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              color: "var(--color-text-secondary)",
              lineHeight: "20px",
            }}
          >
            Reason: {evaluation.rationale}
          </div>
        </div>

        {/* 2. Potential risk areas */}
        {evaluation.riskAreas.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              paddingTop: "2px",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.8px",
                color: "var(--color-text-secondary)",
                textTransform: "uppercase",
              }}
            >
              Potential Risk Areas
            </span>
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "11px",
                color: "var(--color-text-muted)",
                margin: 0,
              }}
            >
              Risk signals — not confirmed vulnerabilities.
            </p>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "5px" }}
            >
              {evaluation.riskAreas
                .sort((a, b) => b.probability - a.probability)
                .map((area) => (
                  <RiskBar
                    key={area.category}
                    label={area.category}
                    value={area.probability}
                  />
                ))}
            </div>
          </div>
        )}

        {/* 3. Jev rationale footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            background: "var(--color-panel)",
            borderRadius: "var(--radius-sm)",
            minHeight: "36px",
            padding: "8px 12px",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              color: "var(--color-text-secondary)",
            }}
          >
            JEV
          </span>
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              color: "var(--color-text-secondary)",
              lineHeight: "16px",
            }}
          >
            {evaluation.subsystem} · risk score {evaluation.riskScore.toFixed(2)} · security likelihood {evaluation.securityFlawLikelihood.toFixed(2)}
          </span>
        </div>

        {/* 4. DeepSeek change-impact summary */}
        <div
          style={{
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            paddingBottom: "var(--space-4)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-xs)",
                fontWeight: 600,
                letterSpacing: "0.04em",
                color: "var(--color-text-muted)",
                textTransform: "uppercase",
              }}
            >
              Change Impact
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-xs)",
                color: "var(--color-text-muted)",
              }}
            >
              · DeepSeek
            </span>
          </div>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-base)",
              color: "var(--color-text-secondary)",
              lineHeight: "160%",
              margin: 0,
            }}
          >
            {summary.overview}
          </p>

          {summary.behaviorChanged.length > 0 && (
            <SummarySection title="Behavior changed" items={summary.behaviorChanged} />
          )}
          {summary.potentialImpact.length > 0 && (
            <SummarySection title="Potential impact" items={summary.potentialImpact} />
          )}
          {summary.reviewFocus.length > 0 && (
            <SummarySection title="Review focus" items={summary.reviewFocus} />
          )}
          {summary.suspiciousSignals.length > 0 && (
            <SummarySection title="Suspicious signals" items={summary.suspiciousSignals} />
          )}
        </div>

        {/* 5. Limitations */}
        {result.limitations.length > 0 && (
          <div
            style={{
              background: "var(--color-warning-bg)",
              border: "1px solid var(--color-warning-text)",
              borderRadius: "var(--radius-sm)",
              padding: "10px 14px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-xs)",
                fontWeight: 600,
                color: "var(--color-warning-text)",
              }}
            >
              ⚠ Limitations
            </span>
            {result.limitations.map((l, i) => (
              <p
                key={i}
                style={{
                  margin: 0,
                  fontFamily: "var(--font-sans)",
                  fontSize: "var(--text-xs)",
                  color: "var(--color-warning-text)",
                }}
              >
                {l}
              </p>
            ))}
          </div>
        )}

        {/* 6. Diff preview */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-sm)",
                color: "var(--color-text-secondary)",
              }}
            >
              {summary.affectedFiles[0] ?? "Changed files"}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-xs)",
                  color: "var(--color-success-text)",
                }}
              >
                +{pullRequest.additions}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-xs)",
                  color: "var(--color-danger-text)",
                }}
              >
                -{pullRequest.deletions}
              </span>
            </div>
          </div>

          <div
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-sm)",
                lineHeight: "16px",
              }}
            >
              <div
                style={{
                  background: "var(--color-danger-bg)",
                  display: "flex",
                  gap: "12px",
                  padding: "6px var(--space-4)",
                }}
              >
                <span
                  style={{
                    color: "var(--color-danger-text)",
                    flexShrink: 0,
                    width: "16px",
                  }}
                >
                  −
                </span>
                <span style={{ color: "var(--color-danger-text)" }}>
                  {summary.affectedFiles[0] ?? "see full diff"}
                </span>
              </div>
              {summary.affectedFiles.slice(1, 4).map((f, i) => (
                <div
                  key={i}
                  style={{
                    background: "var(--color-success-bg)",
                    display: "flex",
                    gap: "12px",
                    padding: "6px var(--space-4)",
                  }}
                >
                  <span
                    style={{
                      color: "var(--color-success-text)",
                      flexShrink: 0,
                      width: "16px",
                    }}
                  >
                    +
                  </span>
                  <span style={{ color: "var(--color-success-text)" }}>{f}</span>
                </div>
              ))}
          </div>
        </div>

        {/* 7. Actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            paddingTop: "var(--space-4)",
            paddingBottom: "var(--space-6)",
          }}
        >
          <a
            href={pullRequest.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "8px 16px",
              background: "var(--color-text-primary)",
              color: "var(--color-bg)",
              borderRadius: "var(--radius-sm)",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Open PR on GitHub
          </a>
          <a
            href={`${pullRequest.htmlUrl}/files`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "8px 16px",
              background: "transparent",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            View full diff
          </a>
          <button
            onClick={onRerun}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "8px 16px",
              background: "transparent",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Re-run triage
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Summary section ──────────────────────────────────────────────────────────
function SummarySection({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        paddingTop: "4px",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-sm)",
          fontWeight: 600,
          color: "var(--color-text-primary)",
        }}
      >
        {title}
      </span>
      <ul
        style={{
          margin: "0 0 0 16px",
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}
      >
        {items.map((item, i) => (
          <li
            key={i}
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              color: "var(--color-text-secondary)",
              lineHeight: "20px",
            }}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Dashboard (two-pane) ─────────────────────────────────────────────────────

interface DashboardProps {
  results: TriageResult[];
  onRerun: (idx: number) => void;
}

export default function Dashboard({ results, onRerun }: DashboardProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [filter, setFilter] = useState<
    "all" | "ESCALATED" | "NEEDS_REVIEW" | "LOW_RISK"
  >("all");

  const selected = results[selectedIdx];

  return (
    <div
      style={{
        display: "flex",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "var(--color-bg)",
      }}
    >
      <LeftPane
        results={results}
        selectedIdx={selectedIdx}
        onSelect={setSelectedIdx}
        filter={filter}
        onFilter={setFilter}
      />
      {selected ? (
        <RightPane result={selected} onRerun={() => onRerun(selectedIdx)} />
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-text-muted)",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-sm)",
          }}
        >
          No pull request selected.
        </div>
      )}
    </div>
  );
}
