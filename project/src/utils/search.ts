/**
 * Smart, Non-Strict, Typo-Tolerant Search Engine for Nain Tools Inventory
 * Handles case-insensitivity ("font" / caps), spacing variations, symbols/quotes,
 * word order independence, dimension variations, and typo tolerance.
 */

/** Normalizes quotes, slashes, dimensions, dashes, and extra whitespace */
export function normalizeSearchText(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw
    .toString()
    .toLowerCase()
    // Replace smart quotes, double quotes, inch marks with a standard representation
    .replace(/["“”″″'’`]/g, ' ')
    // Replace dimension separators like 'x', 'X', '*', '×' surrounded by numbers with a standard 'x'
    .replace(/(\d+)\s*[xX*×]\s*(\d+)/g, '$1x$2')
    // Replace hyphens and slashes with spaces for token splitting, while preserving fractions
    .replace(/[-_]/g, ' ')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compacts a string by removing all non-alphanumeric characters */
export function compactSearchText(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Calculates Levenshtein Distance for typo tolerance on words */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (Math.abs(a.length - b.length) > 2) return 99;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export type MatchResult = {
  matched: boolean;
  score: number;
};

/**
 * Checks if target fields match the query using multiple loose matching layers.
 * 
 * Target can be a single string or an array of strings (e.g. name, size, rack, category, HSN).
 */
export function smartSearchMatch(
  targets: (string | undefined | null)[] | string | undefined | null,
  query: string
): MatchResult {
  const q = (query || '').trim();
  if (!q) return { matched: true, score: 0 };

  const targetList = Array.isArray(targets) ? targets : [targets];
  const combinedRaw = targetList.filter(Boolean).join(' ');
  const normTarget = normalizeSearchText(combinedRaw);
  const normQuery = normalizeSearchText(q);

  if (!normTarget || !normQuery) return { matched: false, score: 0 };

  // 1. Exact substring match in normalized text (Score: 100)
  if (normTarget.includes(normQuery)) {
    // If exact start, even higher
    const score = normTarget.startsWith(normQuery) ? 120 : 100;
    return { matched: true, score };
  }

  // 2. Compact string match (ignores spaces, hyphens, quotes, slashes) (Score: 90)
  // e.g. "ss304" matches "SS 304", "1/2x2" matches "1/2\" X 2\"", "m12x50" matches "M-12 X 50"
  const compactTarget = compactSearchText(combinedRaw);
  const compactQuery = compactSearchText(q);
  if (compactQuery.length >= 2 && compactTarget.includes(compactQuery)) {
    const score = compactTarget.startsWith(compactQuery) ? 95 : 90;
    return { matched: true, score };
  }

  // 3. Multi-token word-order independent match (Score: 80)
  // e.g. "304 allen 2" matches "SS 304 ALLEN BOLT 1/2\"X2\""
  const queryTokens = normQuery.split(/\s+/).filter(Boolean);
  const targetWords = normTarget.split(/\s+/).filter(Boolean);

  let allTokensMatched = true;
  let tokenMatchScore = 0;

  for (const token of queryTokens) {
    const compactToken = compactSearchText(token);

    // Direct token substring
    const tokenInTarget = normTarget.includes(token) || (compactToken && compactTarget.includes(compactToken));
    if (tokenInTarget) {
      tokenMatchScore += 15;
      continue;
    }

    // Check if token matches prefix of any target word
    const prefixMatch = targetWords.some((tw) => tw.startsWith(token) || (compactToken && compactSearchText(tw).startsWith(compactToken)));
    if (prefixMatch) {
      tokenMatchScore += 10;
      continue;
    }

    // Check typo tolerance (Levenshtein distance <= 1 for words of length >= 4)
    if (token.length >= 4) {
      const fuzzyWordMatch = targetWords.some((tw) => tw.length >= 3 && levenshtein(token, tw) <= 1);
      if (fuzzyWordMatch) {
        tokenMatchScore += 8;
        continue;
      }
    }

    // If one token fails all checks, multi-token match fails
    allTokensMatched = false;
    break;
  }

  if (allTokensMatched && queryTokens.length > 0) {
    return { matched: true, score: 75 + tokenMatchScore };
  }

  // 4. Fallback: If query has 2+ tokens, match if at least 70% of tokens match
  if (queryTokens.length >= 2) {
    let matchedCount = 0;
    for (const token of queryTokens) {
      const compactToken = compactSearchText(token);
      if (normTarget.includes(token) || (compactToken && compactTarget.includes(compactToken))) {
        matchedCount++;
      } else if (targetWords.some((tw) => tw.startsWith(token))) {
        matchedCount++;
      } else if (token.length >= 4 && targetWords.some((tw) => levenshtein(token, tw) <= 1)) {
        matchedCount++;
      }
    }

    if (matchedCount / queryTokens.length >= 0.65) {
      return { matched: true, score: 60 + matchedCount * 5 };
    }
  }

  return { matched: false, score: 0 };
}

/**
 * Filters and ranks a list of items using smart non-strict matching.
 * If a category filter is active and produces 0 results, it falls back to
 * searching across all categories so the user always sees matching results!
 */
export function smartFilterItems<T>(
  items: T[],
  query: string,
  extractFields: (item: T) => (string | undefined | null)[],
  options?: {
    maxResults?: number;
    activeCategory?: string;
    getCategory?: (item: T) => string | undefined | null;
  }
): T[] {
  const q = (query || '').trim();
  const maxResults = options?.maxResults ?? 100;

  if (!q) {
    return items.slice(0, maxResults);
  }

  const scoredItems: { item: T; score: number }[] = [];

  for (const item of items) {
    const fields = extractFields(item);
    const result = smartSearchMatch(fields, q);
    if (result.matched) {
      scoredItems.push({
        item,
        score: result.score,
      });
    }
  }

  scoredItems.sort((a, b) => b.score - a.score);
  return scoredItems.map((s) => s.item).slice(0, maxResults);
}
