// Decoration-set computation: coverage spans → per-theme-token line ranges.
// The per-line treatment mirrors the serve SPA's gutter (ui/app.js
// stripeClass): expired scar tissue and open questions stand apart, everything
// else colors by the first covering span's confidence. Colors are VS Code
// theme color *tokens* (never hex) so every theme renders them natively; the
// extension layer turns each token into a ThemeColor-backed decoration type.

import type { CoverageSpan, LineRange } from "./contract.js";

/** Treatment → theme color token. Exported so tests pin the vocabulary and
 * the extension builds exactly one decoration type per token. */
export const TREATMENT_TOKENS = {
  expired: "editorWarning.foreground",
  question: "editorInfo.foreground",
  recorded: "charts.green",
  corroborated: "charts.blue",
  inferred: "charts.yellow",
  speculative: "descriptionForeground",
  none: "descriptionForeground",
} as const;

export type ThemeToken = (typeof TREATMENT_TOKENS)[keyof typeof TREATMENT_TOKENS];

export const ALL_TOKENS: readonly ThemeToken[] = [...new Set(Object.values(TREATMENT_TOKENS))];

/** Spans covering a 1-based line; a span without `lines` is a whole-file
 * claim and covers every line (same rule as the serve SPA). */
export function coveringSpans(spans: CoverageSpan[], line: number): CoverageSpan[] {
  return spans.filter(
    (span) => span.lines === undefined || (span.lines.start <= line && line <= span.lines.end),
  );
}

function treatmentToken(covering: CoverageSpan[]): ThemeToken | undefined {
  if (covering.length === 0) return undefined;
  if (covering.some((span) => span.type === "constraint" && span.status === "expired")) {
    return TREATMENT_TOKENS.expired;
  }
  if (covering.some((span) => span.type === "question")) return TREATMENT_TOKENS.question;
  const confidence = covering[0]!.confidence;
  switch (confidence) {
    case "recorded":
      return TREATMENT_TOKENS.recorded;
    case "corroborated":
      return TREATMENT_TOKENS.corroborated;
    case "inferred":
      return TREATMENT_TOKENS.inferred;
    case "speculative":
      return TREATMENT_TOKENS.speculative;
    default:
      return TREATMENT_TOKENS.none;
  }
}

/**
 * Per theme token, the contiguous 1-based inclusive line ranges to decorate
 * in a file of `lineCount` lines. Lines beyond the open document are dropped:
 * coverage is computed at HEAD and the buffer may be shorter — painting past
 * the end would be a silently-wrong mark.
 */
export function decorationRanges(
  spans: CoverageSpan[],
  lineCount: number,
): Map<ThemeToken, LineRange[]> {
  const ranges = new Map<ThemeToken, LineRange[]>();
  let open: { token: ThemeToken; range: LineRange } | undefined;
  for (let line = 1; line <= lineCount; line++) {
    const token = treatmentToken(coveringSpans(spans, line));
    if (open !== undefined && open.token === token) {
      open.range.end = line;
      continue;
    }
    open = token === undefined ? undefined : { token, range: { start: line, end: line } };
    if (open !== undefined) {
      const list = ranges.get(open.token) ?? [];
      list.push(open.range);
      ranges.set(open.token, list);
    }
  }
  return ranges;
}
