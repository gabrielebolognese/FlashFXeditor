// Templates (spec §15, Batch 42): Save as template keeps the open project's settings, track layout
// (with the caption style) and its own text presets in IndexedDB; the start screen lists them for New
// from template (projectController `newFromTemplate`). Works in a read-only project too: nothing is
// written to the folder.
import { templateFromProject } from "../project/templates.js";
import { showToast } from "../ui/toasts.js";
import { presetLibrary } from "./presetController.js";
import { closeDialog, currentSession, showDialog } from "./projectController.js";
import { actions, documentStore, templateStore } from "./services.js";

/** `project.saveAsTemplate`: the name dialog. */
export function openSaveTemplate(): void {
  if (currentSession()) showDialog({ kind: "saveTemplate" });
}

/** Saves the open project as a template named `name` (one of the same name is replaced). */
export async function saveAsTemplate(name: string): Promise<void> {
  if (!currentSession()) return;
  const template = templateFromProject(documentStore.getState(), presetLibrary.getState().project, { id: crypto.randomUUID(), name, now: new Date().toISOString() });
  const replaced = templateStore.list.getState().some((other) => other.name.toLowerCase() === template.name.toLowerCase());
  await templateStore.save(template);
  closeDialog();
  showToast({ tone: "success", message: replaced ? `Updated the template ${template.name}` : `Saved the template ${template.name}`, detail: "New from template on the start screen starts a project with it." });
}

export function removeTemplate(id: string): void {
  void templateStore.remove(id);
}

export function installTemplateController(): () => void {
  return actions.register("project.saveAsTemplate", openSaveTemplate, { enabled: () => currentSession() !== null });
}
