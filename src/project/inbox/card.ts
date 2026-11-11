// The card file and the head of project.json (project inbox). A generator may write `card.json` next to
// `project.json`: every field is optional, unknown fields are ignored, a wrong type drops that field only.
// Without a card the inbox shows what the top of project.json says (id, name, settings), read from the first
// bytes of the file when they hold it.

export const CARD_FILE = "card.json";
export const CARD_SCHEMA = "card/1";

export interface CardCheck {
  name: string;
  ok: boolean;
}

export interface Card {
  title: string | null;
  kind: string | null;
  generator: string | null;
  generationId: string | null;
  /** ISO time, kept only when it parses. */
  generatedAt: string | null;
  durationSec: number | null;
  format: string | null;
  /** A path relative to the project folder (segments joined by `/`, `..` allowed for `video`). */
  poster: string | null;
  video: string | null;
  checks: readonly CardCheck[];
  notes: readonly string[];
}

export const EMPTY_CARD: Card = { title: null, kind: null, generator: null, generationId: null, generatedAt: null, durationSec: null, format: null, poster: null, video: null, checks: [], notes: [] };

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

/** The card a `card.json` text holds; null when it is not a JSON object. */
export function parseCard(source: string): Card | null {
  let json: unknown;
  try {
    json = JSON.parse(source);
  } catch {
    return null;
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null;
  const raw = json as Record<string, unknown>;
  const generatedAt = text(raw.generatedAt);
  const checks: CardCheck[] = [];
  if (Array.isArray(raw.checks)) {
    for (const item of raw.checks as unknown[]) {
      if (typeof item !== "object" || item === null) continue;
      const check = item as Record<string, unknown>;
      const name = text(check.name);
      if (name !== null && typeof check.ok === "boolean") checks.push({ name, ok: check.ok });
    }
  }
  return {
    title: text(raw.title),
    kind: text(raw.kind),
    generator: text(raw.generator),
    generationId: text(raw.generationId),
    generatedAt: generatedAt !== null && !Number.isNaN(Date.parse(generatedAt)) ? generatedAt : null,
    durationSec: typeof raw.durationSec === "number" && Number.isFinite(raw.durationSec) && raw.durationSec >= 0 ? raw.durationSec : null,
    format: text(raw.format),
    poster: text(raw.poster),
    video: text(raw.video),
    checks,
    notes: Array.isArray(raw.notes) ? (raw.notes as unknown[]).map(text).filter((note): note is string => note !== null) : [],
  };
}

/** What the inbox needs of a project.json: its id, its name and its format ("1080x1920 30 fps"). */
export interface ProjectHead {
  id: string | null;
  name: string | null;
  format: string | null;
}

/** How many bytes of project.json are read first: the editor and the generators write id, name and settings near the top. */
export const HEAD_BYTES = 8192;

function formatOf(settings: unknown): string | null {
  if (typeof settings !== "object" || settings === null) return null;
  const s = settings as { width?: unknown; height?: unknown; fps?: unknown };
  if (typeof s.width !== "number" || typeof s.height !== "number") return null;
  const size = `${s.width}x${s.height}`;
  const fps = s.fps as { num?: unknown; den?: unknown } | number | undefined;
  const rate = typeof fps === "number" ? fps : fps && typeof fps.num === "number" && typeof fps.den === "number" && fps.den > 0 ? fps.num / fps.den : null;
  return rate === null ? size : `${size} ${Number.isInteger(rate) ? rate : rate.toFixed(2)} fps`;
}

function headOf(values: Map<string, unknown>): ProjectHead {
  return { id: text(values.get("id")), name: text(values.get("name")), format: formatOf(values.get("settings")) };
}

/** The end (exclusive) of the JSON value that starts at `start`, or -1 when the text ends inside it. */
function valueEnd(source: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') {
        inString = false;
        if (depth === 0) return i + 1;
      }
    } else if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      if (depth === 0) return i;
      depth--;
      if (depth === 0) return i + 1;
    } else if (depth === 0 && (ch === "," || ch === "\n" || ch === "\r" || ch === " " || ch === "\t")) return i;
  }
  return -1;
}

/**
 * The head from the first bytes of a project.json: the top-level `id`, `name` and `settings`, found without
 * parsing the rest. null when the piece ends before all three were seen (the caller then reads the whole file).
 */
export function scanProjectHead(piece: string): ProjectHead | null {
  const wanted = new Set(["id", "name", "settings"]);
  const values = new Map<string, unknown>();
  let i = piece.indexOf("{");
  if (i < 0) return null;
  i++;
  while (i < piece.length && values.size < wanted.size) {
    while (i < piece.length && /[\s,]/.test(piece[i] as string)) i++;
    if (piece[i] !== '"') return null;
    const keyEnd = valueEnd(piece, i);
    if (keyEnd < 0) return null;
    let key: unknown;
    try {
      key = JSON.parse(piece.slice(i, keyEnd));
    } catch {
      return null;
    }
    i = keyEnd;
    while (i < piece.length && /[\s:]/.test(piece[i] as string)) i++;
    const end = valueEnd(piece, i);
    if (end < 0) return null;
    if (typeof key === "string" && wanted.has(key)) {
      try {
        values.set(key, JSON.parse(piece.slice(i, end)));
      } catch {
        return null;
      }
    }
    i = end;
  }
  return values.size === wanted.size ? headOf(values) : null;
}

/** The head from a whole project.json text; every field null when it is not a JSON object. */
export function parseProjectHead(source: string): ProjectHead {
  try {
    const json: unknown = JSON.parse(source);
    if (typeof json === "object" && json !== null) return headOf(new Map(Object.entries(json)));
  } catch {
    // Not JSON: the card still lists, opening it reports the problem.
  }
  return { id: null, name: null, format: null };
}
