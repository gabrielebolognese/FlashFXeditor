// The command ids audit (Batch 40): every key dispatches a registered command, every registered
// command has a catalog entry (its label, category and icon for buttons, menus and the palette), every
// catalog entry is registered, and the planned list (core/keyboard/planned.ts) holds only commands no
// one registers yet. Run on startup in dev builds (app/commandAudit.ts) and by the unit tests.

export interface CommandAuditInput {
  /** Ids the CommandRegistry holds. */
  registered: readonly string[];
  /** Ids the command catalog describes. */
  catalog: readonly string[];
  /** Ids the keymap binds. */
  keymap: readonly string[];
  /** Ids a later batch builds (bound, not registered yet). */
  planned: readonly string[];
}

/** The problems found, one sentence each (empty: the audit passes). */
export function auditCommands({ registered, catalog, keymap, planned }: CommandAuditInput): string[] {
  const isRegistered = new Set(registered);
  const inCatalog = new Set(catalog);
  const isPlanned = new Set(planned);
  const problems: string[] = [];
  for (const id of new Set(keymap)) {
    if (!isRegistered.has(id) && !isPlanned.has(id)) problems.push(`The key of ${id} dispatches a command nothing registers.`);
    if (!inCatalog.has(id)) problems.push(`${id} has keys but no catalog entry (label, category).`);
  }
  for (const id of isRegistered) {
    if (!inCatalog.has(id)) problems.push(`${id} is registered but has no catalog entry (label, category).`);
    if (isPlanned.has(id)) problems.push(`${id} is registered: remove it from planned.ts.`);
  }
  for (const id of inCatalog) {
    if (!isRegistered.has(id) && !isPlanned.has(id)) problems.push(`${id} is in the catalog but nothing registers it.`);
  }
  return problems;
}
