import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PanelId } from "../core/store/layoutStore.js";
import { PanelBoundary } from "./PanelBoundary.js";
import { panelEpochs, panelFaults, reloadPanels, reportPanelFault } from "./panelErrors.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanups: (() => void)[] = [];
// React reports the errors the boundaries catch on window as well; jsdom would print each one.
const quiet = (event: ErrorEvent) => event.preventDefault();
window.addEventListener("error", quiet);
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  panelFaults.set({});
  panelEpochs.set({});
});

function mount(node: ReturnType<typeof createElement>): Root {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(node));
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return root;
}

let broken = false;
let mounts = 0;

function Panel({ name }: { name: string }) {
  if (broken) throw new Error("Cannot read properties of undefined (reading 'clipIds')");
  return createElement("section", { "data-panel": name }, `${name} works`);
}

/** Counts its mounts (a reload builds the panel again). */
function Counted() {
  mounts += 1;
  return createElement("p", null, "counted");
}

const boundary = (id: PanelId, title: string, children: ReactNode) => createElement(PanelBoundary, { id, title, children });

const workspace = () => createElement("main", null, boundary("media", "Media", createElement(Panel, { name: "media" })), boundary("timeline", "Timeline", createElement(Panel, { name: "timeline" })));

describe("PanelBoundary (Batch 47)", () => {
  it("shows a failed panel's error state in its place while the other panels keep working, then reloads it", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    broken = false;
    const root = mount(workspace());
    expect(document.body.textContent).toContain("media works");
    // The media panel breaks on its next render; the timeline does not render again.
    broken = true;
    act(() => root.render(createElement("main", null, boundary("media", "Media", createElement(Panel, { name: "media" })), boundary("timeline", "Timeline", createElement("section", null, "timeline works")))));
    const failed = document.querySelector("[data-panel-error]");
    expect(failed?.getAttribute("data-panel")).toBe("media");
    expect(failed?.textContent).toContain("Media stopped working");
    expect(failed?.textContent).toContain("Cannot read properties of undefined (reading 'clipIds')");
    expect(failed?.querySelector('[data-command="panel.reload"]')?.textContent).toBe("Reload panel");
    expect(document.body.textContent).toContain("timeline works");
    expect(panelFaults.getState()).toEqual({ media: "Cannot read properties of undefined (reading 'clipIds')" });
    broken = false;
    act(() => {
      reloadPanels(["media"]);
    });
    expect(document.querySelector("[data-panel-error]")).toBeNull();
    expect(document.body.textContent).toContain("media works");
  });

  it("shows a fault reported from outside React (a canvas view) and mounts the panel afresh on reload", () => {
    mounts = 0;
    mount(boundary("preview", "Preview", createElement(Counted)));
    expect(mounts).toBe(1);
    act(() => reportPanelFault("preview", new Error("GPU texture is destroyed")));
    expect(document.querySelector("[data-panel-error]")?.textContent).toContain("Preview stopped working");
    act(() => {
      reloadPanels(["preview"]);
    });
    expect(document.body.textContent).toContain("counted");
    expect(mounts).toBe(2);
  });
});
