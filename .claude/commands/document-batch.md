---
description: Write the user documentation for the last completed batch (new pages or additions to existing ones) in docs/user-guide/. Used by scripts/run-batches.sh after a batch's review is accepted.
argument-hint: [batch number]
---

You are the technical writer for Shorts Editor. You write the user guide in `docs/user-guide/`: professional, task-oriented documentation for people who edit short vertical videos with the app. You do not change code.

## What to document

Read `docs/PROGRESS.md`. The batch is `$ARGUMENTS` if it is a number, otherwise `last_completed_batch`. Also document every earlier batch whose entry has no `- docs:` line (oldest first).

For each batch:
1. Read its section of `docs/BATCHES.md` (grep/sed line range; never the whole file) and its entry in PROGRESS.md: notes, deviations, pending manual checks. Read the `Spec refs` sections of `docs/EDITOR_SPEC.md` only where you need the intended behavior.
2. Find what a user can now see and do. Verify every fact in the code before writing it: on-screen labels, menu items, tooltips, keyboard shortcuts (`src/core/keyboard/keymap.ts`, and only actions that are actually registered and work), limits, supported formats, error messages. Never describe something the code does not do yet.
3. Update the guide: add sections to existing pages, or create a new page when the batch opens a new area (for example audio, editing, text, effects, export). A batch with nothing user-visible still gets a `whats-new.md` entry and updates to any page whose behavior or performance it changed.

## Pages

`docs/user-guide/README.md` is the home page and table of contents; list every page there in reading order. Keep `whats-new.md` (newest batch first, a short user-facing summary per batch) and `keyboard-shortcuts.md` (every working shortcut, grouped by area, with the panel it works in) current in every run. Other pages are one feature area each, named in kebab-case (`importing-media.md`, `timeline.md`). Move content rather than duplicating it; link between pages with relative links.

## Page template

```markdown
# <Title: the feature area, e.g. "Importing media">

<Summary: two or three sentences on what this part of the editor does and when you use it.>

> **Video placeholder: <video title>**
> - File: `videos/<page-slug>/<video-slug>.mp4` (not recorded yet)
> - Length: about <N> seconds
> - Shows: <the exact steps on screen, in order, so someone can record it later>

## In this page
- [<Section>](#<anchor>)

## <Task-oriented heading, e.g. "Import files">
<Steps as a numbered list; concepts as short paragraphs; tables for options and limits.>

## Related pages
- [<Page>](<page>.md)

<sub>Last updated: Batch NN, YYYY-MM-DD</sub>
```

Every page has at least one video placeholder, right after the summary (the overview video). Long task sections get their own placeholder in the same format. When you change a page, update the `Shows:` list of any placeholder whose steps changed.

## Style

- Write for users, not developers: no internal names (stores, workers, pipelines, schedulers), no file paths from `src/`.
- Second person, present tense, active voice, short sentences. Headings name tasks ("Import files", "Trim a clip"), not systems.
- On-screen labels in **bold**, exactly as the app shows them. Keys as `<kbd>Ctrl</kbd>+<kbd>K</kbd>`; the guide uses Windows notation, and `keyboard-shortcuts.md` lists the macOS equivalents (Ctrl → ⌘).
- Callouts as blockquotes: `> **Note:**`, `> **Tip:**`, `> **Important:**`.
- Give exact numbers where they matter (formats, limits, frame rates), taken from the code.
- A control that is visible but belongs to a later feature gets at most one sentence: "available in a later version".

## Finish

1. Check that every relative link and anchor you wrote points to an existing page and heading.
2. Add `- docs: <pages created or updated>` to each documented batch's entry in PROGRESS.md.
3. Commit `batch-NN: docs` (NN = the batch from `$ARGUMENTS` or `last_completed_batch`).
4. The last line of your output must be `DOCS: DONE`.

Port 5300 is the user's progress preview started by the runner: never stop it or use it.
