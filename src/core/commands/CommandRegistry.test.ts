import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "./CommandRegistry.js";

describe("CommandRegistry", () => {
  it("runs registered commands with their context", () => {
    const actions = new CommandRegistry();
    const undo = vi.fn();
    actions.register("history.undo", undo);
    const context = { scope: "global", phase: "down", repeat: false } as const;
    expect(actions.run("history.undo", context)).toBe(true);
    expect(undo).toHaveBeenCalledWith(context);
    expect(actions.run("history.undo")).toBe(true);
    expect(undo).toHaveBeenLastCalledWith(null);
  });

  it("passes the argument a row names", () => {
    const actions = new CommandRegistry();
    const apply = vi.fn();
    actions.register("preset.apply", apply);
    actions.run("preset.apply", null, "preset-1");
    expect(apply).toHaveBeenCalledWith(null, "preset-1");
  });

  it("reports unknown and declined commands as unhandled", () => {
    const actions = new CommandRegistry();
    actions.register("x", () => false);
    expect(actions.has("x")).toBe(true);
    expect(actions.run("x")).toBe(false);
    expect(actions.has("y")).toBe(false);
    expect(actions.run("y")).toBe(false);
  });

  it("refuses duplicate registrations and unregisters", () => {
    const actions = new CommandRegistry();
    const unregister = actions.register("x", () => {});
    expect(() => actions.register("x", () => {})).toThrow(/already registered/);
    unregister();
    expect(actions.has("x")).toBe(false);
    expect(actions.ids()).toEqual([]);
  });

  it("reads enabled predicates; commands without one are enabled, unknown ones are not", () => {
    const actions = new CommandRegistry();
    let ready = false;
    actions.register("a", () => {}, { enabled: () => ready });
    actions.register("b", () => {});
    actions.register("c", () => {}, {
      enabled: () => {
        throw new Error("no project");
      },
    });
    expect(actions.isEnabled("a")).toBe(false);
    ready = true;
    expect(actions.isEnabled("a")).toBe(true);
    expect(actions.isEnabled("b")).toBe(true);
    expect(actions.isEnabled("c")).toBe(false);
    expect(actions.isEnabled("missing")).toBe(false);
    expect(actions.hasPredicate("a")).toBe(true);
    expect(actions.hasPredicate("b")).toBe(false);
    expect(actions.ids()).toEqual(["a", "b", "c"]);
  });
});
