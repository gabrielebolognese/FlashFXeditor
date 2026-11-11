// The review file and the status of an inbox card. Opening a project writes `review.json` into its folder
// (a temporary file first, then a replace: never a half-written file, and project.json is not touched). The
// status compares what was reviewed with what the generator last wrote (the card's `generationId`).
import type { FsDir } from "../fs.js";

export const REVIEW_FILE = "review.json";
export const REVIEW_TMP_FILE = "review.json.tmp";
export const REVIEW_SCHEMA = "review/1";

export interface Review {
  schema: typeof REVIEW_SCHEMA;
  firstOpenedAt: string;
  lastOpenedAt: string;
  /** The card's generationId when the project was opened; null when the card had none. */
  reviewedGenerationId: string | null;
}

/** The review a `review.json` text holds; null when it is not one. */
export function parseReview(source: string): Review | null {
  try {
    const raw = JSON.parse(source) as Partial<Review> | null;
    if (typeof raw !== "object" || raw === null) return null;
    if (typeof raw.firstOpenedAt !== "string" || typeof raw.lastOpenedAt !== "string") return null;
    return { schema: REVIEW_SCHEMA, firstOpenedAt: raw.firstOpenedAt, lastOpenedAt: raw.lastOpenedAt, reviewedGenerationId: typeof raw.reviewedGenerationId === "string" ? raw.reviewedGenerationId : null };
  } catch {
    return null;
  }
}

export async function readReview(dir: FsDir): Promise<Review | null> {
  const file = await dir.readFile(REVIEW_FILE);
  return file ? parseReview(file.text) : null;
}

/** The review after an opening at `now`: the first opening is kept. */
export function openedReview(previous: Review | null, generationId: string | null, now: string): Review {
  return { schema: REVIEW_SCHEMA, firstOpenedAt: previous?.firstOpenedAt ?? now, lastOpenedAt: now, reviewedGenerationId: generationId };
}

/** Writes review.json: the temporary file, then the replace. Throws when the folder cannot be written. */
export async function writeReview(dir: FsDir, review: Review): Promise<void> {
  await dir.writeText(REVIEW_TMP_FILE, `${JSON.stringify(review, null, 2)}\n`);
  await dir.rename(REVIEW_TMP_FILE, REVIEW_FILE);
}

export type ReviewStatus =
  /** Never opened. */
  | "new"
  /** Opened, then built again by the generator: not reviewed, with the "updated" note. */
  | "updated"
  | "reviewed";

/** The status of a card: `generationId` is the card's (null without a card or without the field). */
export function reviewStatus(generationId: string | null, review: Review | null): ReviewStatus {
  if (!review) return "new";
  if (generationId !== null && review.reviewedGenerationId !== generationId) return "updated";
  return "reviewed";
}
