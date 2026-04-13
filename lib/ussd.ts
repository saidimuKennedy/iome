// USSD response builder, case ID generator, and severity mapper
import type { IncidentType, Severity } from "@/app/generated/prisma/client";
import type { Lang } from "@/lib/ussd-strings";

// ─── Response builders ────────────────────────────────────────────────────────
// Africa's Talking expects the response body to start with CON (session
// continues) or END (session terminates). Nothing else.

/** Session continues — user sees another menu screen. */
export function con(text: string): string {
  return `CON ${text}`;
}

/** Session ends — this is the last screen the user sees. */
export function end(text: string): string {
  return `END ${text}`;
}

// ─── Case ID generator ────────────────────────────────────────────────────────
// Format: INC-2026-00123 / ASR-2026-00045
// seqNum is the autoincrement integer from the DB row.

export function generateCaseId(
  prefix: "INC" | "ASR",
  seqNum: number,
  year?: number
): string {
  const y = year ?? new Date().getFullYear();
  const padded = seqNum.toString().padStart(5, "0");
  return `${prefix}-${y}-${padded}`;
}

// ─── Severity mapper ──────────────────────────────────────────────────────────
// Auto-derived from incident type + life-threatening flag.
// EOC operators can override after creation.
//
// Rules (from implementation plan change #2):
//   fire + lifeThreating       → critical
//   medical + lifeThreating    → critical
//   accident + lifeThreating   → critical
//   fire (no life threat)      → high
//   medical (no life threat)   → high
//   flood + lifeThreating      → high
//   flood (no life threat)     → medium
//   accident (no life threat)  → medium
//   security + lifeThreating   → high
//   security (no life threat)  → medium

export function mapSeverity(
  incidentType: IncidentType,
  lifeThreating: boolean
): Severity {
  if (lifeThreating) {
    if (
      incidentType === "fire" ||
      incidentType === "medical" ||
      incidentType === "accident"
    ) {
      return "critical";
    }
    // flood, security with life threat
    return "high";
  }

  if (incidentType === "fire" || incidentType === "medical") {
    return "high";
  }

  return "medium";
}

// ─── Location menu builder ────────────────────────────────────────────────────
// Builds the USSD location screen dynamically from DB-seeded landmarks.
// Landmarks are ordered by displayOrder ascending (set in seed data).

export type LocationOption = {
  displayOrder: number;
  landmarkNameEn: string;
  landmarkNameSw: string;
};

/**
 * Builds the location picker screen text.
 * Landmarks come from the DB, ordered by displayOrder.
 * "Other" is always appended as the last numbered option.
 * "0. Back" is always the final line.
 *
 * @example
 * "Incident Location:\n1. Kisauni Market\n2. Kisauni Health Centre\n...\n6. Other\n0. Back"
 */
export function buildLocationMenu(
  lang: Lang,
  locations: LocationOption[]
): string {
  const header = lang === "sw" ? "Mahali pa Tukio:" : "Incident Location:";
  const other = lang === "sw" ? "Mengine (andika mahali)" : "Other (type location)";
  const back = "0. Back";

  const lines = [header];
  for (const loc of locations) {
    const name =
      lang === "sw" ? loc.landmarkNameSw : loc.landmarkNameEn;
    lines.push(`${loc.displayOrder}. ${name}`);
  }
  const otherIndex = locations.length + 1;
  lines.push(`${otherIndex}. ${other}`);
  lines.push(back);

  return lines.join("\n");
}

// ─── Text accumulator parser ──────────────────────────────────────────────────
// AT sends the full accumulated path in the `text` field on every callback.
// e.g. "" → "2" → "2*1" → "2*1*3" → "2*1*3*1" → "2*1*3*1*1"
// Split on "*" and filter empty strings to get individual step inputs.

export function parseAccumulator(text: string): string[] {
  return text.split("*").filter((s) => s !== "");
}

// ─── Step navigator ───────────────────────────────────────────────────────────
// Returns the input for a specific step index (0-based), or undefined if the
// user hasn't reached that step yet.

export function stepInput(steps: string[], index: number): string | undefined {
  return steps[index];
}
