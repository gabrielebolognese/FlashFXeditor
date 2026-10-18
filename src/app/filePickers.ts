// Opening and saving one small text file (presets JSON, subtitle files): the File System Access
// pickers where the browser has them, else a file input and a download link. A cancelled picker is no
// error: the result is null (open) or false (save).

export interface PickerType {
  description: string;
  accept: Record<string, string[]>;
}

interface FilePickerWindow {
  showOpenFilePicker?(options: { types: PickerType[]; multiple?: boolean }): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?(options: { suggestedName: string; types: PickerType[] }): Promise<FileSystemFileHandle>;
}

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

/** One file the user picks among `types` (null when cancelled). */
export async function pickFile(types: readonly PickerType[]): Promise<File | null> {
  const picker = window as unknown as FilePickerWindow;
  if (picker.showOpenFilePicker) {
    try {
      const [handle] = await picker.showOpenFilePicker({ types: [...types] });
      return handle ? await handle.getFile() : null;
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = types.flatMap((type) => Object.entries(type.accept).flatMap(([mime, extensions]) => [mime, ...extensions])).join(",");
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
}

/** The files the user picks among `types` (several at once; empty when cancelled). */
export async function pickFiles(types: readonly PickerType[]): Promise<File[]> {
  const picker = window as unknown as FilePickerWindow;
  if (picker.showOpenFilePicker) {
    try {
      const handles = await picker.showOpenFilePicker({ types: [...types], multiple: true });
      return await Promise.all(handles.map((handle) => handle.getFile()));
    } catch (error) {
      if (isAbort(error)) return [];
      throw error;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = types.flatMap((type) => Object.entries(type.accept).flatMap(([mime, extensions]) => [mime, ...extensions])).join(",");
    input.addEventListener("change", () => resolve([...(input.files ?? [])]), { once: true });
    input.addEventListener("cancel", () => resolve([]), { once: true });
    input.click();
  });
}

/**
 * Saves `text` as a file the user names (suggested `name`): `content` gives the text for the name
 * chosen (a format picked by its extension). Returns the saved name, or null when cancelled.
 */
export async function saveFile(name: string, types: readonly PickerType[], content: (fileName: string) => string): Promise<string | null> {
  const picker = window as unknown as FilePickerWindow;
  if (picker.showSaveFilePicker) {
    try {
      const handle = await picker.showSaveFilePicker({ suggestedName: name, types: [...types] });
      const stream = await handle.createWritable();
      await stream.write(content(handle.name));
      await stream.close();
      return handle.name;
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
  }
  const mime = Object.keys(types[0]?.accept ?? {})[0] ?? "text/plain";
  const url = URL.createObjectURL(new Blob([content(name)], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return name;
}
