import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateStrict } from "../core/document/strict.js";
import { buildSpansFixture } from "./spansFixture.js";

const FILE = "fixtures/interop/spans/project.json";

// The writer only runs when asked, so a normal run never rewrites a file other tests read in parallel.
it.skipIf(!process.env.WRITE_SPANS_FIXTURE)("writes the spans interop fixture", () => {
  writeFileSync(FILE, `${JSON.stringify(buildSpansFixture(), null, 2)}\n`);
});

describe("fixtures/interop/spans (Batch 67)", () => {
  const read = () => JSON.parse(readFileSync(FILE, "utf8"));

  it("is the project this build writes", () => {
    expect(read()).toEqual(JSON.parse(JSON.stringify(buildSpansFixture())));
  });

  it("is strictly valid and uses every span field", () => {
    const committed = read();
    const result = validateStrict(committed);
    expect(result.errors).toEqual([]);
    const used = new Set<string>();
    for (const clip of Object.values(committed.clips) as { spans?: { style: Record<string, unknown> }[] }[]) for (const span of clip.spans ?? []) for (const key of Object.keys(span.style)) used.add(key);
    expect([...used].sort()).toEqual(["fill", "fontWeight", "highlight", "italic", "strike", "underline"]);
  });
});
