---
description: Load the next implementation batch from docs/BATCHES.md into context, present a plan, and build it only after the user replies "Go".
argument-hint: [batch number | status | plan | redo | skip]
---

You are running the batch workflow for the Shorts Editor. Follow these steps exactly and in order.

Path note: the design system lives at `DESIGN_SYSTEM.md` (repo root). Wherever the docs say `DESIGN_SYSTEMS.md`, use `DESIGN_SYSTEM.md`.

## Step 1: Resolve which batch

Read `docs/PROGRESS.md`. Let `last` = `last_completed_batch`, `inprog` = `in_progress_batch`.

Interpret `$ARGUMENTS`:
- empty: if `inprog` is a number, resume that batch (it was started but not finished: find what remains from its entry in PROGRESS.md and from the code); otherwise target `last + 1`.
- a number `N`: target batch N. If N > last + 1, warn that the batches in between were not completed and ask for confirmation before continuing.
- `status`: print a compact table of all batches (number, title, status from PROGRESS.md), the design system gaps and the open follow-ups, then stop. Get the titles with `grep -n "^## Batch [0-9]" docs/BATCHES.md`.
- `plan`: same as empty, but never build in this run, even if the user later says Go (plan-only mode).
- `redo`: target the batch currently in progress, or `last` if none; treat the batch as a fresh implementation of its remaining acceptance items (do not revert finished work).
- `skip`: ask the user for a one-line reason, record the target batch as skipped in PROGRESS.md (`skipped_batches` and a batch entry with status skipped), then stop.

Batch numbers are two-digit in headings (`## Batch 07:`); optional batches have a suffix (`## Batch 33 (optional):`).

## Step 2: Load exactly what is needed (do not read whole files)

1. From `docs/BATCHES.md`, extract the `## Batch rules` section and the section of the target batch only: from the heading matching `^## Batch NN[ :]` up to the next line that starts with `## Batch` or `---`. Use grep with line numbers and sed to extract the range; never read the whole file.
2. From the batch text, collect the `Spec refs` list. For each `§n` read the whole `## n.` section of `docs/EDITOR_SPEC.md`; for each `§n.n` read the `### n.n` subsection. Always also read `## 0` and `## 4` (they are short and binding). Extract by heading ranges with grep and sed.
3. Read `DESIGN_SYSTEM.md` in full. It governs every UI value.
4. From `docs/PROGRESS.md`, read the Global deviations, the Follow-ups addressed to this batch, the Design system gaps, and the entries of the two previous batches.
5. Look at the code the batch will touch: `find src -maxdepth 3 -type d`, and open the specific modules named in the batch's `Build` and `Implementation notes`. Do not open unrelated modules.

## Step 3: Present the plan and stop

Output, in this order and nothing else:

1. `## Batch NN: <title>` and the one-line Goal.
2. **Build plan**: a numbered list mapping each `Build` item to concrete files (create or modify), in the order you will implement them. Name the store subscriptions, worker messages, commands (with their ids) and tests you will add.
3. **Design system usage**: the token names you will use and any gap you already see.
4. **Risks and deviations**: anything in the batch that conflicts with the current code or the spec, with your proposed resolution.
5. **Questions**: at most 3, only if an answer changes what you build. Otherwise write `none`.
6. **Acceptance checklist**: restate the batch's acceptance items verbatim as checkboxes.
7. The line: `Reply "Go" to build this batch, or answer the questions / request changes to the plan.`

Then STOP. Write no code, create no files, run no build. Wait for the user. If the user replies with changes or answers, update the plan and stop again. Only the exact word `Go` (any casing) starts implementation. In `plan` mode, never implement.

If the user answers with a split (e.g. "split: do items 1-4 now, 5-7 as a second Go"), build in passes under the same batch number, one commit per pass (`batch-NN-a: <title>`, `batch-NN-b: <title>`), keeping `in_progress_batch: NN` until the last pass is done.

## Step 4: On "Go", build

1. Set `in_progress_batch: NN` in `docs/PROGRESS.md` and add (or update) the batch entry with `status: in_progress` and the date.
2. Implement the plan. Respect `docs/EDITOR_SPEC.md` §3 and §4 as binding, the batch's `Do not build yet` list, and the Batch rules. When a future feature needs a hook, add an interface or a `// TODO(batch MM)` comment, never a partial implementation.
3. Write the unit tests the Batch rules require for engine code in the same batch.
4. Run `npm run check` (typecheck, lint, test, build). Fix everything until it is green. Never mark the batch done with a red check.
5. Verify the acceptance checklist: run the tests that cover each item; for manual items, do what can be done from the shell (build, scripted checks, dev commands) and list the remainder as `pending manual checks` for the user with exact steps to reproduce.
6. Update `docs/PROGRESS.md`: `last_completed_batch: NN`, `in_progress_batch: none`, and the batch entry with `status: done`, date, notes (what was built, numbers measured), deviations (with reasons), follow-ups (as `[from Batch NN -> Batch MM]` lines, also copied to the Follow-ups section), design gaps (also copied to the Design system gaps section), pending manual checks.
7. Commit everything: `git add -A && git commit -m "batch-NN: <title>"`.
8. Print a completion report: the checklist with ticks, the pending manual checks, the commit hash, and the line `Next: run /next-batch for Batch MM: <title>`.

Never start the next batch on your own. Never skip the plan step. Never read the whole of `docs/BATCHES.md` or `docs/EDITOR_SPEC.md` into context; extract sections.
