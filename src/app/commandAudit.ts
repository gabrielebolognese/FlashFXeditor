// Dev-build command audit (Batch 40: "every button and menu item in the app dispatches a registered
// command, dev assertion passes on startup"). On startup: every key dispatches a registered command,
// every registered command has a catalog entry and the reverse, and planned.ts holds only unbuilt
// ones (core/commands/audit.ts). Then, for the whole session, every button and menu row the app renders
// is checked as it appears: it carries the registered command it runs (`data-command`), or it is a
// declared control of a field or a dialog (`data-control`: a value toggle, Cancel), a menu opener
// (`aria-haspopup`) or a form role (tab, option, checkbox, radio, switch). Problems go to the console
// (and a toast at startup); `__editor.commands.audit()` lists them for the acceptance checks.
import { auditCommands } from "../core/commands/audit.js";
import { DEFAULT_KEYMAP, keymap } from "../core/keyboard/keymap.js";
import { PLANNED_COMMANDS } from "../core/keyboard/planned.js";
import { showToast } from "../ui/toasts.js";
import { COMMANDS } from "./commandCatalog.js";
import { actions } from "./services.js";

const ACTION_SELECTOR = "button, [role='menuitem'], [role='menuitemradio'], [role='menuitemcheckbox']";
const FORM_ROLES = new Set(["tab", "option", "checkbox", "radio", "switch"]);

const isKnown = (id: string) => actions.has(id) || id in PLANNED_COMMANDS;

/** The registry, catalog, keymap and planned list agree (the startup assertion). */
export function auditRegistry(): string[] {
  return auditCommands({
    registered: actions.ids(),
    catalog: COMMANDS.filter((info) => !info.dev || import.meta.env.DEV).map((info) => info.id),
    keymap: [...DEFAULT_KEYMAP, ...keymap.bindings()].map((binding) => binding.id),
    planned: Object.keys(PLANNED_COMMANDS),
  });
}

const describe = (element: Element) => {
  const name = element.getAttribute("aria-label") ?? element.getAttribute("data-tooltip") ?? element.textContent?.trim().slice(0, 40) ?? "";
  const panel = element.closest("[data-panel]")?.getAttribute("data-panel") ?? element.closest("[role='menu']")?.getAttribute("role") ?? "app";
  return `${element.tagName.toLowerCase()} "${name}" (${panel})`;
};

/** What is wrong with one element, or null. */
export function elementProblem(element: Element): string | null {
  const command = element.getAttribute("data-command");
  if (command !== null && command !== "") return isKnown(command) ? null : `${describe(element)} dispatches ${command}, which is not registered.`;
  if (!element.matches(ACTION_SELECTOR)) return null;
  if (element.closest("[data-control]") || element.hasAttribute("aria-haspopup")) return null;
  const role = element.getAttribute("role");
  if (role !== null && FORM_ROLES.has(role)) return null;
  return `${describe(element)} dispatches no command (data-command) and is no declared control (data-control).`;
}

/** Checks `root` and everything under it. */
export function auditElements(root: Element): string[] {
  const problems: string[] = [];
  const check = (element: Element) => {
    const problem = elementProblem(element);
    if (problem) problems.push(problem);
  };
  check(root);
  for (const element of root.querySelectorAll(`${ACTION_SELECTOR}, [data-command]`)) check(element);
  return problems;
}

/** Runs the startup audit and watches the DOM (dev builds). Returns a stop function. */
export function installCommandAudit(doc: Document = document): () => void {
  const found = new Set<string>();
  const report = (problems: readonly string[]) => {
    for (const problem of problems) {
      if (found.has(problem)) continue;
      found.add(problem);
      console.error(`[commands] ${problem}`);
    }
  };
  const startup = auditRegistry();
  report(startup);
  if (startup.length > 0) showToast({ tone: "error", message: `Command audit: ${startup.length} problem${startup.length === 1 ? "" : "s"}`, detail: "Dev builds only. Details in the console." });
  else console.info(`[commands] audit passed: ${actions.ids().length} commands registered, ${keymap.bindings().length} key bindings, all in the catalog`);

  // Buttons and menu rows as they appear (menus, popovers, a panel's tab): only added elements are read.
  let pending: Element[] = [];
  let timer: number | undefined;
  const flush = () => {
    timer = undefined;
    const roots = pending;
    pending = [];
    for (const root of roots) if (root.isConnected) report(auditElements(root));
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) pending.push(node);
    if (pending.length > 0 && timer === undefined) timer = window.setTimeout(flush, 100);
  });
  observer.observe(doc.body, { childList: true, subtree: true });
  pending.push(doc.body);
  flush();

  const editor = ((globalThis as { __editor?: Record<string, unknown> }).__editor ??= {});
  editor.commands = {
    /** Every problem found so far, plus a fresh pass over the document. */
    audit: () => {
      report([...auditRegistry(), ...auditElements(doc.body)]);
      return [...found];
    },
    registered: () => actions.ids(),
  };
  return () => {
    observer.disconnect();
    window.clearTimeout(timer);
  };
}
