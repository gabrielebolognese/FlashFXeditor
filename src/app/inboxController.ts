// The project inbox for the UI: when the watched folders are looked at (at start, when the window gets the
// focus, every 30 s while the window is visible), the toast for a project that appears while another one is
// open, and the commands of a card (open, its right-click menu) and of a folder (Reconnect). Framework-free;
// the start screen reads `inbox.state`.
import type { InboxEntry } from "../project/inbox/inbox.js";
import { showToast } from "../ui/toasts.js";
import { appView, BLOCKED_FOLDER_HINT, openFolder } from "./projectController.js";
import { actions, inbox } from "./services.js";

/** How often the watched folders are looked at while the window is visible. */
export const INBOX_SCAN_MS = 30_000;

/** Looks at the watched folders now; a project that appeared while another one is open gets a toast. */
export async function scanInbox(): Promise<void> {
  let fresh: InboxEntry[];
  try {
    fresh = await inbox.scan();
  } catch (error) {
    console.warn("[inbox] scan failed", error);
    return;
  }
  const open = appView.getState().project;
  if (!open) return;
  const others = fresh.filter((entry) => entry.projectId !== open.id && !entry.edited);
  const first = others[0];
  if (!first) return;
  // It never interrupts: the open project stays until Open is clicked (which saves it first, as any switch does).
  if (others.length === 1) showToast({ tone: "info", message: `New project ready: ${first.title}`, action: { label: "Open", run: () => void openInboxEntry(first.key) } }, { durationMs: 15_000 });
  else showToast({ tone: "info", message: `${others.length} new projects ready`, detail: "They are in the inbox on the start screen." }, { durationMs: 15_000 });
}

const entryOf = (key: unknown): InboxEntry | null => (typeof key === "string" ? (inbox.state.getState().entries.find((entry) => entry.key === key) ?? null) : null);

/** One click on a card: opens the project exactly as Open project or a link would. */
export function openInboxEntry(key: string): Promise<void> {
  const entry = entryOf(key);
  return entry ? openFolder(entry.dir) : Promise.resolve();
}

/** The Reconnect button of a watched folder (its click is the user gesture the browser wants). */
export async function reconnectFolder(id: string): Promise<void> {
  try {
    if (!(await inbox.reconnect(id))) showToast({ tone: "warning", message: "The folder is still not allowed", detail: "Click Reconnect again and choose Allow. If the browser refuses the folder itself: " + BLOCKED_FOLDER_HINT }, { durationMs: 12_000 });
  } catch (error) {
    console.warn("[inbox] reconnect failed", error);
    showToast({ tone: "warning", message: "Could not reconnect the folder", detail: BLOCKED_FOLDER_HINT }, { durationMs: 12_000 });
  }
}

/** Registers the inbox commands and starts looking at the watched folders. Returns a stop function. */
export function installInboxController(): () => void {
  void scanInbox();
  const onFocus = () => void scanInbox();
  const onVisibility = () => {
    if (document.visibilityState === "visible") void scanInbox();
  };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);
  const timer = window.setInterval(() => {
    if (document.visibilityState === "visible") void scanInbox();
  }, INBOX_SCAN_MS);
  const withEntry = (run: (entry: InboxEntry) => void) => (_context: unknown, key: unknown) => {
    const entry = entryOf(key);
    if (entry) run(entry);
  };
  const stops = [
    actions.register("inbox.open", (_context, key) => {
      if (typeof key === "string") void openInboxEntry(key);
    }),
    actions.register("inbox.reconnect", (_context, id) => {
      if (typeof id === "string") void reconnectFolder(id);
    }),
    actions.register("inbox.markReviewed", withEntry((entry) => void inbox.setReviewed(entry, true))),
    actions.register("inbox.markNotReviewed", withEntry((entry) => void inbox.setReviewed(entry, false))),
    actions.register("inbox.remove", withEntry((entry) => void inbox.hide(entry))),
    // Back on the start screen: the card of the project just closed shows its new status at once.
    appView.select(
      (view) => view.project,
      (project) => {
        if (!project) void scanInbox();
      },
    ),
    () => window.removeEventListener("focus", onFocus),
    () => document.removeEventListener("visibilitychange", onVisibility),
    () => window.clearInterval(timer),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
