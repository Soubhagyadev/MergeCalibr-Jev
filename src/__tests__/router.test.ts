import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeDecision } from "@/lib/router";
import type { JevEvaluation } from "@/lib/types";

const makeEval = (overrides: Partial<JevEvaluation> = {}): JevEvaluation => ({
  riskScore: 0.5,
  confidence: 0.8,
  subsystem: "general",
  securityFlawLikelihood: 0.1,
  riskAreas: [],
  rationale: "Test rationale",
  ...overrides,
});

describe("computeDecision", () => {
  beforeEach(() => {
    vi.stubEnv("LOW_RISK_MAX", "0.25");
    vi.stubEnv("ESCALATED_MIN", "0.75");
    vi.stubEnv("MIN_CONFIDENCE", "0.70");
  });

  // Three routing outcomes
  it("returns ESCALATED when riskScore >= 0.75 and confidence >= 0.70", () => {
    const ev = makeEval({ riskScore: 0.88, confidence: 0.94 });
    expect(computeDecision(ev, [])).toBe("ESCALATED");
  });

  it("returns LOW_RISK when riskScore <= 0.25, confidence >= 0.70, securityFlawLikelihood < 0.25", () => {
    const ev = makeEval({
      riskScore: 0.1,
      confidence: 0.9,
      securityFlawLikelihood: 0.05,
      subsystem: "docs",
    });
    expect(computeDecision(ev, [])).toBe("LOW_RISK");
  });

  it("returns NEEDS_REVIEW for mid-range scores", () => {
    const ev = makeEval({ riskScore: 0.42, confidence: 0.72 });
    expect(computeDecision(ev, [])).toBe("NEEDS_REVIEW");
  });

  // Low confidence behavior
  it("returns NEEDS_REVIEW when confidence is below MIN_CONFIDENCE", () => {
    const ev = makeEval({ riskScore: 0.1, confidence: 0.5, securityFlawLikelihood: 0.05 });
    expect(computeDecision(ev, [])).toBe("NEEDS_REVIEW");
  });

  it("returns NEEDS_REVIEW when riskScore is borderline low but confidence is low", () => {
    const ev = makeEval({ riskScore: 0.2, confidence: 0.6 });
    expect(computeDecision(ev, [])).toBe("NEEDS_REVIEW");
  });

  // Limitations → never LOW_RISK
  it("returns NEEDS_REVIEW when limitations are present, even for low-risk scores", () => {
    const ev = makeEval({
      riskScore: 0.05,
      confidence: 0.95,
      securityFlawLikelihood: 0.01,
      subsystem: "docs",
    });
    expect(computeDecision(ev, ["PR was chunked"])).toBe("NEEDS_REVIEW");
  });

  // High-severity escalation
  it("forces ESCALATED for HIGH severity risk area", () => {
    const ev = makeEval({
      riskScore: 0.3,
      confidence: 0.8,
      riskAreas: [
        {
          category: "Error handling",
          severity: "HIGH",
          probability: 0.4,
          evidence: "throws unhandled",
        },
      ],
    });
    expect(computeDecision(ev, [])).toBe("ESCALATED");
  });

  // Sensitive keyword escalation
  it("forces ESCALATED for authentication subsystem", () => {
    const ev = makeEval({
      riskScore: 0.1,
      confidence: 0.95,
      securityFlawLikelihood: 0.02,
      subsystem: "authentication middleware",
    });
    expect(computeDecision(ev, [])).toBe("ESCALATED");
  });

  it("forces ESCALATED for session-related subsystem", () => {
    const ev = makeEval({ subsystem: "session store" });
    expect(computeDecision(ev, [])).toBe("ESCALATED");
  });

  it("forces ESCALATED for payment-related subsystem", () => {
    const ev = makeEval({ subsystem: "payment gateway" });
    expect(computeDecision(ev, [])).toBe("ESCALATED");
  });

  it("forces ESCALATED for cryptography subsystem", () => {
    const ev = makeEval({ subsystem: "cryptography utils" });
    expect(computeDecision(ev, [])).toBe("ESCALATED");
  });
});
