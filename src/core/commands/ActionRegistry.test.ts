import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "./ActionRegistry.js";

describe("ActionRegistry", () => {
  it("runs registered actions with their context", () => {
    const actions = new ActionRegistry();
    const undo = vi.fn();
    actions.register("history.undo", undo);
    const context = { scope: "global", phase: "down", repeat: false } as const;
    expect(actions.run("history.undo", context)).toBe(true);
    expect(undo).toHaveBeenCalledWith(context);
    expect(actions.run("history.undo")).toBe(true);
    expect(undo).toHaveBeenLastCalledWith(null);
  });

  it("reports unknown and declined actions as unhandled", () => {
    const actions = new ActionRegistry();
    actions.register("x", () => false);
    expect(actions.has("x")).toBe(true);
    expect(actions.run("x")).toBe(false);
    expect(actions.has("y")).toBe(false);
    expect(actions.run("y")).toBe(false);
  });

  it("refuses duplicate registrations and unregisters", () => {
    const actions = new ActionRegistry();
    const unregister = actions.register("x", () => {});
    expect(() => actions.register("x", () => {})).toThrow(/already registered/);
    unregister();
    expect(actions.has("x")).toBe(false);
  });
});
