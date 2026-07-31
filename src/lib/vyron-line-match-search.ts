import type { MatchOption } from "@/lib/vyron-document-review-client";
import type { ReviewDraftLine } from "@/lib/vyron-document-review-client";
import type { SuggestedMatchReason } from "@/lib/vyron-supplier-line-learning";

export type MatchQuality = "remembered" | "exact" | "similar" | "manual";

export type RankedMatchRow = {
  option: MatchOption;
  quality: MatchQuality;
  rank: number;
  section: "smart" | "other";
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizeText(value).split(" ").filter(Boolean);
}

function wordOverlapScore(a: string, b: string) {
  const wordsA = new Set(tokenize(a));
  const wordsB = new Set(tokenize(b));
  if (!wordsA.size || !wordsB.size) return 0;
  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap += 1;
  }
  return overlap / Math.max(wordsA.size, wordsB.size);
}

function similarScore(description: string, name: string) {
  const left = normalizeText(description);
  const right = normalizeText(name);
  if (!left || !right) return 0;
  if (left.includes(right) || right.includes(left)) return 0.92;
  return wordOverlapScore(left, right);
}

function entityTypeFromQuery(query: string): MatchOption["entityType"] | null {
  const q = query.trim().toLowerCase();
  if (q === "ingredient" || q === "ingredients") return "ingredient";
  if (q === "packaging" || q === "package") return "packaging";
  if (q === "product" || q === "products") return "product";
  return null;
}

export function matchesSearchQuery(option: MatchOption, query: string, line: ReviewDraftLine) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;

  const typeFilter = entityTypeFromQuery(trimmed);
  if (typeFilter) return option.entityType === typeFilter;

  const haystack = [
    option.name,
    entityTypeLabel(option.entityType),
    line.description || "",
    line.skuOrProductCode || "",
  ]
    .join(" ")
    .toLowerCase();

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}

function classifyOption(line: ReviewDraftLine, option: MatchOption): { quality: MatchQuality; rank: number } {
  const desc = line.description || "";
  const sku = (line.skuOrProductCode || "").trim().toLowerCase();
  const unit = (line.unit || "").trim().toLowerCase();
  const nameNorm = normalizeText(option.name);
  const descNorm = normalizeText(desc);

  const suggested = line.suggestedMatch;
  if (
    suggested?.entityId &&
    suggested.entityId === option.id &&
    (suggested.entityType === option.entityType || !suggested.entityType)
  ) {
    const reason = (suggested.matchReason || "remembered") as SuggestedMatchReason;
    if (reason === "sku" || reason === "description_exact") {
      return { quality: "exact", rank: 0 };
    }
    if (reason === "description_similar") {
      return { quality: "similar", rank: 1 };
    }
    return { quality: "remembered", rank: 1 };
  }

  if (descNorm && nameNorm === descNorm) {
    return { quality: "exact", rank: 2 };
  }

  const fuzzy = similarScore(desc, option.name);
  if (fuzzy >= 0.55) {
    return { quality: "similar", rank: 3 + (1 - fuzzy) };
  }

  if (sku && nameNorm.includes(sku)) {
    return { quality: "similar", rank: 4 };
  }

  if (unit && (nameNorm.includes(unit) || unit.length >= 2)) {
    const optionUnitHint = option.name.toLowerCase().includes(unit);
    if (optionUnitHint) {
      return { quality: "similar", rank: 5 };
    }
  }

  return { quality: "manual", rank: 100 };
}

export function rankMatchOptions(
  line: ReviewDraftLine,
  options: MatchOption[],
  searchQuery: string,
  entityTypeFilter?: ReviewDraftLine["matchedEntityType"]
): RankedMatchRow[] {
  const hasSearch = searchQuery.trim().length > 0;
  const pool = options.filter((option) => {
    if (!hasSearch && entityTypeFilter && entityTypeFilter !== "product" && option.entityType !== entityTypeFilter) {
      return false;
    }
    if (!hasSearch && entityTypeFilter === "product" && option.entityType !== "product") {
      return false;
    }
    return matchesSearchQuery(option, searchQuery, line);
  });

  const ranked = pool.map((option) => {
    const { quality, rank } = classifyOption(line, option);
    const section: "smart" | "other" = rank < 50 ? "smart" : "other";
    return { option, quality, rank, section };
  });

  ranked.sort((a, b) => {
    if (a.section !== b.section) return a.section === "smart" ? -1 : 1;
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.option.name.localeCompare(b.option.name);
  });

  return ranked;
}

export function entityTypeLabel(entityType: MatchOption["entityType"]) {
  if (entityType === "packaging") return "Packaging";
  if (entityType === "product") return "Product";
  return "Ingredient";
}

export function entityTypePillClass(entityType: MatchOption["entityType"]) {
  if (entityType === "packaging") return "bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]";
  if (entityType === "product") return "bg-blue-100 text-blue-800";
  return "bg-violet-100 text-violet-800";
}

export function matchQualityLabel(quality: MatchQuality) {
  if (quality === "remembered") return "Remembered Match";
  if (quality === "exact") return "Exact Match";
  if (quality === "similar") return "Similar Match";
  return "Manual Match";
}

export function matchQualityClass(quality: MatchQuality) {
  if (quality === "remembered") return "bg-[#A855F7]/12 text-[#4D7C0F]";
  if (quality === "exact") return "bg-sky-100 text-sky-800";
  if (quality === "similar") return "bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]";
  return "bg-slate-100 text-slate-700";
}

export function matchQualityFromSuggestion(reason?: SuggestedMatchReason | null): MatchQuality {
  if (reason === "sku" || reason === "description_exact") return "exact";
  if (reason === "description_similar") return "similar";
  if (reason === "remembered") return "remembered";
  return "remembered";
}
