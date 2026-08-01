import type { MatchOption, ReviewDraft, ReviewDraftLine } from "@/lib/vyron-document-review-client";
import { withDerivedLineAmounts, withLineAmounts } from "@/lib/vyron-invoice-line-math";
import { matchQualityFromSuggestion } from "@/lib/vyron-line-match-search";
import type { MatchQuality } from "@/lib/vyron-line-match-search";

function optionKey(option: Pick<MatchOption, "entityType" | "id">) {
  return `${option.entityType}:${option.id}`;
}

/** Keep matched labels/options stable across re-renders and refresh. */
export function hydrateReviewDraft(draft: ReviewDraft): ReviewDraft {
  const matchOptions = [...draft.matchOptions];
  const optionByKey = new Map(matchOptions.map((option) => [optionKey(option), option]));

  const lines = draft.lines.map((line) => {
    // Load path: hydration restores match labels, it does not re-derive money.
    // See deriveLineAmounts — recomputing here discarded the extracted totals a
    // second time, after loadReviewDraft had already mapped them.
    let next: ReviewDraftLine = { ...withDerivedLineAmounts(line) };

    if (next.matchedEntityId && next.matchedEntityType) {
      const key = optionKey({ entityType: next.matchedEntityType, id: next.matchedEntityId });
      const existing = optionByKey.get(key);
      if (existing) {
        if (!next.matchedEntityName?.trim()) {
          next = { ...next, matchedEntityName: existing.name };
        }
      } else if (next.matchedEntityName?.trim()) {
        const created: MatchOption = {
          id: next.matchedEntityId,
          name: next.matchedEntityName,
          entityType: next.matchedEntityType,
          currentPrice: Number(next.unitPrice ?? 0),
        };
        matchOptions.push(created);
        optionByKey.set(key, created);
      }
    } else if (next.suggestedMatch?.entityId && next.suggestedMatch.entityType) {
      const suggested = next.suggestedMatch;
      const entityId = suggested.entityId;
      const entityType = suggested.entityType as ReviewDraftLine["matchedEntityType"];
      if (entityId && (entityType === "ingredient" || entityType === "packaging" || entityType === "product")) {
        next = {
          ...next,
          matchedEntityType: entityType,
          matchedEntityId: entityId,
          matchedEntityName: suggested.entityName || "",
        };
        const key = optionKey({ entityType, id: entityId });
        if (!optionByKey.has(key) && suggested.entityName) {
          const created: MatchOption = {
            id: entityId,
            name: suggested.entityName,
            entityType,
            currentPrice: Number(next.unitPrice ?? 0),
          };
          matchOptions.push(created);
          optionByKey.set(key, created);
        }
      }
    }

    return next;
  });

  return { ...draft, lines, matchOptions };
}

/** Initial match-quality badges for auto-applied supplier learning suggestions. */
export function buildInitialLineMatchQuality(draft: ReviewDraft): Record<string, MatchQuality> {
  const qualities: Record<string, MatchQuality> = {};
  for (const line of draft.lines) {
    if (!line.matchedEntityId || !line.suggestedMatch) continue;
    if (
      line.suggestedMatch.entityId === line.matchedEntityId &&
      (line.suggestedMatch.entityType === line.matchedEntityType || !line.suggestedMatch.entityType)
    ) {
      qualities[line.id] = matchQualityFromSuggestion(line.suggestedMatch.matchReason);
    }
  }
  return qualities;
}

export function mergeMatchOption(draft: ReviewDraft, option: MatchOption): ReviewDraft {
  const key = optionKey(option);
  const exists = draft.matchOptions.some((row) => optionKey(row) === key);
  return {
    ...draft,
    matchOptions: exists ? draft.matchOptions : [...draft.matchOptions, option],
  };
}

export function createEmptyLine(): ReviewDraftLine {
  const base: ReviewDraftLine = {
    id: crypto.randomUUID(),
    description: "",
    quantity: 1,
    unit: "kg",
    unitPrice: null,
    vat: null,
    lineTotal: null,
    lineExclVat: null,
    skuOrProductCode: "",
    confidenceScore: null,
    fieldConfidence: {
      description: null,
      quantity: null,
      unit: null,
      unitPrice: null,
      vatAmount: null,
      lineTotal: null,
      skuOrProductCode: null,
    },
    matchedEntityType: null,
    matchedEntityId: null,
    matchedEntityName: null,
    ignored: false,
  };
  return withLineAmounts(base);
}
