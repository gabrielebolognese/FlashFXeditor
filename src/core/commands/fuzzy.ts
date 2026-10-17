// Fuzzy matching for the command palette (Batch 40): every word of the query must appear in the text in
// order, as a substring (best) or as a subsequence of its letters (word starts and runs score higher).

const isBoundary = (text: string, index: number) => index === 0 || /[^a-z0-9]/.test(text[index - 1] ?? "");

/** Score of one query word against lower-case `text`, or null when it does not match. */
function wordScore(word: string, text: string): number | null {
  const at = text.indexOf(word);
  if (at >= 0) {
    // A substring: at a word start best, earlier better, a whole word best of all.
    let score = 100 + word.length * 4 - Math.min(at, 30);
    if (isBoundary(text, at)) score += 40;
    if (isBoundary(text, at) && !/[a-z0-9]/.test(text[at + word.length] ?? "")) score += 20;
    return score;
  }
  // A subsequence: each letter after the previous one.
  let score = 0;
  let from = 0;
  let previous = -2;
  for (const char of word) {
    const index = text.indexOf(char, from);
    if (index < 0) return null;
    score += 1;
    if (index === previous + 1) score += 5;
    if (isBoundary(text, index)) score += 8;
    score -= Math.min(index - from, 10) * 0.5;
    previous = index;
    from = index + 1;
  }
  return score;
}

/** Score of `query` against `text` (case-insensitive), or null when some query word does not match. */
export function fuzzyScore(query: string, text: string): number | null {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const haystack = text.toLowerCase();
  let total = 0;
  for (const word of words) {
    const score = wordScore(word, haystack);
    if (score === null) return null;
    total += score;
  }
  return total;
}

export interface Rankable {
  id: string;
  label: string;
  category: string;
  /** More words the command answers to ("compact" for Close all gaps). */
  keywords?: string | undefined;
}

/**
 * The palette's order: with no query, the recent commands first (most recent first), then the rest in
 * the given order; with a query, the matches by score (label first, then keywords and category), recent
 * ones a little higher.
 */
export function rankCommands<T extends Rankable>(items: readonly T[], query: string, recent: readonly string[]): T[] {
  const recency = new Map(recent.map((id, index) => [id, index]));
  if (query.trim() === "") {
    const recentItems = items.filter((item) => recency.has(item.id)).sort((a, b) => (recency.get(a.id) ?? 0) - (recency.get(b.id) ?? 0));
    return [...recentItems, ...items.filter((item) => !recency.has(item.id))];
  }
  const scored: { item: T; score: number; index: number }[] = [];
  items.forEach((item, index) => {
    const label = fuzzyScore(query, item.label);
    const keywords = item.keywords ? fuzzyScore(query, item.keywords) : null;
    const category = fuzzyScore(query, `${item.category} ${item.label}`);
    const best = Math.max(label ?? -Infinity, keywords === null ? -Infinity : keywords * 0.9, category === null ? -Infinity : category * 0.7);
    if (best === -Infinity) return;
    const rank = recency.get(item.id);
    scored.push({ item, score: best + (rank === undefined ? 0 : 15 - Math.min(rank, 10)), index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((entry) => entry.item);
}

/** `id` first in the recent list, once, at most `max` long. */
export function pushRecent(recent: readonly string[], id: string, max: number): string[] {
  return [id, ...recent.filter((other) => other !== id)].slice(0, max);
}
