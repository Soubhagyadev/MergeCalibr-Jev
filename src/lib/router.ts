import type { JevEvaluation, TriageDecision } from "./types";

const LOW_RISK_MAX = parseFloat(process.env.LOW_RISK_MAX ?? "0.25");
const ESCALATED_MIN = parseFloat(process.env.ESCALATED_MIN ?? "0.75");
const MIN_CONFIDENCE = parseFloat(process.env.MIN_CONFIDENCE ?? "0.70");

/** Sensitive subsystems/keywords that force ESCALATED regardless of scores. */
const SENSITIVE_KEYWORDS = [
  "auth",
  "authentication",
  "authorization",
  "session",
  "oauth",
  "jwt",
  "token",
  "secret",
  "password",
  "credential",
  "cryptograph",
  "encrypt",
  "decrypt",
  "payment",
  "billing",
  "stripe",
  "migration",
  "database migration",
  "schema migration",
  "privilege",
  "access control",
  "rbac",
  "permission",
];

function hasSensitiveSignal(evaluation: JevEvaluation): boolean {
  // Check subsystem
  const subsystem = evaluation.subsystem.toLowerCase();
  if (SENSITIVE_KEYWORDS.some((kw) => subsystem.includes(kw))) return true;

  // Check high-severity risk areas
  for (const area of evaluation.riskAreas) {
    if (area.severity === "HIGH") return true;
    const cat = area.category.toLowerCase();
    if (SENSITIVE_KEYWORDS.some((kw) => cat.includes(kw))) return true;
  }

  return false;
}

export function computeDecision(
  evaluation: JevEvaluation,
  limitations: string[]
): TriageDecision {
  const { riskScore, confidence, securityFlawLikelihood } = evaluation;
  const hasLimitations = limitations.length > 0;

  // Force ESCALATED for sensitive security signals.
  if (hasSensitiveSignal(evaluation)) {
    return "ESCALATED";
  }

  // Incomplete evidence / low confidence / provider uncertainty → never LOW_RISK.
  if (hasLimitations) {
    return "NEEDS_REVIEW";
  }

  if (riskScore >= ESCALATED_MIN && confidence >= MIN_CONFIDENCE) {
    return "ESCALATED";
  }

  if (
    riskScore <= LOW_RISK_MAX &&
    confidence >= MIN_CONFIDENCE &&
    securityFlawLikelihood < LOW_RISK_MAX
  ) {
    return "LOW_RISK";
  }

  return "NEEDS_REVIEW";
}
