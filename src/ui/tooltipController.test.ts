import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installTooltips, pointTooltip } from "./tooltipController.js";

describe("installTooltips", () => {
  let stop: () => void;
  const bubble = () => document.querySelector<HTMLElement>("[role=tooltip]")!;

  beforeEach(() => {
    vi.useFakeTimers();
    stop = installTooltips(document, 400, (id) => (id === "track.lock" ? "Ctrl+L" : undefined));
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("shows a hovered element's tooltip with its command's shortcut after the delay", () => {
    const button = document.createElement("button");
    button.dataset.tooltip = "Lock track";
    button.dataset.command = "track.lock";
    document.body.append(button);
    button.dispatchEvent(new Event("pointerover", { bubbles: true }));
    expect(bubble().dataset.open).toBeUndefined();
    vi.advanceTimersByTime(400);
    expect(bubble().dataset.open).toBe("");
    expect(bubble().textContent).toBe("Lock trackCtrl+L");
  });

  it("points the bubble at a control drawn on a canvas, keeps it while the same tip repeats and hides it on null", () => {
    const tip = { rect: { left: 10, top: 20, width: 16, height: 16 }, text: "Mute track" };
    pointTooltip(tip);
    vi.advanceTimersByTime(300);
    pointTooltip({ ...tip, rect: { ...tip.rect } });
    vi.advanceTimersByTime(100);
    expect(bubble().dataset.open).toBe("");
    expect(bubble().textContent).toBe("Mute track");
    pointTooltip(null);
    expect(bubble().dataset.open).toBeUndefined();
  });

  it("does not show a canvas tip again after a press until the pointer leaves it", () => {
    const tip = { rect: { left: 10, top: 20, width: 16, height: 16 }, text: "Solo track" };
    pointTooltip(tip);
    document.dispatchEvent(new Event("pointerdown"));
    pointTooltip(tip);
    vi.advanceTimersByTime(1000);
    expect(bubble().dataset.open).toBeUndefined();
    pointTooltip(null);
    pointTooltip(tip);
    vi.advanceTimersByTime(400);
    expect(bubble().dataset.open).toBe("");
  });
});
