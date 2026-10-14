import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeBridge, cssVarReader, readTheme } from "./theme.js";

function reader(tokens: Record<string, string>) {
  return (name: string) => tokens[name] ?? "";
}

describe("readTheme", () => {
  it("parses colors as strings and sizes as numbers", () => {
    const { theme } = readTheme(
      reader({
        "--accent": "accent-a",
        "--hairline": "line-a",
        "--type-title-size": "13px",
        "--type-title-track": "-0.1px",
        "--type-title-weight": "600",
        "--radius-md": "6px",
        "--tooltip-delay": "400ms",
      }),
    );
    expect(theme.color.accent).toBe("accent-a");
    expect(theme.color.hairline).toBe("line-a");
    expect(theme.type.title).toMatchObject({ size: 13, track: -0.1, weight: 600 });
    expect(theme.radius.md).toBe(6);
    expect(theme.tooltipDelay).toBe(400);
  });

  it("reads the timeline metrics, the spacing scale and a color pair per clip kind", () => {
    const { theme, missing } = readTheme(
      reader({
        "--timeline-header-width": "176px",
        "--track-height-s": "32px",
        "--track-height-l": "88px",
        "--selection-outline": "1.5px",
        "--playhead": "red-ish",
        "--clip-audio": "green-body",
        "--clip-audio-label": "green-label",
        "--space-3": "8px",
      }),
    );
    expect(theme.timeline).toMatchObject({ headerWidth: 176, selectionOutline: 1.5, playhead: "red-ish", trackHeight: { S: 32, L: 88 } });
    expect(theme.timeline.clip.audio).toEqual({ body: "green-body", label: "green-label" });
    expect(theme.space[3]).toBe(8);
    expect(missing).toContain("--clip-caption-label");
    expect(missing).toContain("--track-height-m");
  });

  it("reports missing tokens instead of throwing", () => {
    const { missing } = readTheme(reader({ "--accent": "accent-a" }));
    expect(missing).toContain("--bg");
    expect(missing).not.toContain("--accent");
  });

  it("reads custom properties from the DOM", () => {
    document.documentElement.style.setProperty("--accent", "accent-dom");
    expect(cssVarReader(document.documentElement)("--accent")).toBe("accent-dom");
    document.documentElement.style.removeProperty("--accent");
  });
});

describe("ThemeBridge", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    vi.restoreAllMocks();
  });

  it("re-reads and notifies when data-theme changes", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const tokens: Record<string, string> = { "--accent": "accent-a" };
    const root = document.documentElement;
    root.setAttribute("data-theme", "dark");
    const bridge = new ThemeBridge(root, () => reader(tokens));
    expect(bridge.theme.color.accent).toBe("accent-a");

    const listener = vi.fn();
    bridge.subscribe(listener);
    const stop = bridge.watch();
    tokens["--accent"] = "accent-b";
    root.setAttribute("data-theme", "test");
    await new Promise((resolve) => setTimeout(resolve, 0));
    stop();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(bridge.theme.name).toBe("test");
    expect(bridge.theme.color.accent).toBe("accent-b");
  });
});
