import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dismissToast, showToast, TOAST_DURATION_MS, toastStore, updateToast } from "./toasts.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const toast of toastStore.getState()) dismissToast(toast.id);
  vi.useRealTimers();
});

const messages = () => toastStore.getState().map((t) => t.message);

describe("toasts", () => {
  it("dismiss themselves after the tone's duration", () => {
    showToast({ tone: "error", message: "Can't import notes.txt" });
    showToast({ tone: "info", message: "Saved" });
    vi.advanceTimersByTime(TOAST_DURATION_MS.info);
    expect(messages()).toEqual(["Can't import notes.txt"]);
    vi.advanceTimersByTime(TOAST_DURATION_MS.error - TOAST_DURATION_MS.info);
    expect(messages()).toEqual([]);
  });

  it("keep progress toasts until updated with a duration or dismissed", () => {
    const id = showToast({ tone: "info", message: "Importing 1 of 10", progress: 0 });
    vi.advanceTimersByTime(60_000);
    updateToast(id, { message: "Importing 2 of 10", progress: 0.1 });
    expect(toastStore.getState()).toEqual([{ id, tone: "info", message: "Importing 2 of 10", progress: 0.1 }]);
    updateToast(id, { tone: "success", message: "Imported 10 files" }, { durationMs: 2000 });
    vi.advanceTimersByTime(2000);
    expect(messages()).toEqual([]);
  });

  it("drop the oldest beyond four", () => {
    for (let i = 1; i <= 6; i++) showToast({ tone: "info", message: `t${i}` });
    expect(messages()).toEqual(["t3", "t4", "t5", "t6"]);
    dismissToast(toastStore.getState()[0]?.id ?? -1);
    expect(messages()).toEqual(["t4", "t5", "t6"]);
  });
});
